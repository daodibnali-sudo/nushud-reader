type Rect = { x0: number; y0: number; x1: number; y1: number };

/** A detected word box in pixels of the page image; `line` is the box of the text line it sits on. */
export type PixelWordBox = Rect & { text: string; line?: Rect };
type Blob = Rect & { area: number };
type Line = { bodies: Blob[]; marks: Blob[]; centerY: number };

/** Inter-word gap as a fraction of tall-letter height, used when a page has too few gaps to learn from. */
const fallbackWordGapRatio = 0.15;

/**
 * Finds word boxes on a page image without reading anything: ink is split into connected blobs,
 * blobs are sorted into letter bodies and small marks (dots, harakat), bodies are grouped into
 * lines, marks join the nearest line, and each line is cut into words at the wide gaps (gaps
 * between the letter groups inside one Arabic word are narrower). Boxes span their line's full
 * height so a crop of one includes its harakat. Returned in reading order: lines top to bottom,
 * words right to left.
 *
 * Tesseract does this job badly on fully vocalized text: it often reads the row of harakat above
 * a line as a separate line of "words" and misses the letters underneath.
 */
export function detectWordBoxes(image: { width: number; height: number; data: Uint8ClampedArray }): PixelWordBox[] {
  const blobs = findInkBlobs(image).filter(
    (blob) => blob.area >= 4 && blob.x1 - blob.x0 < image.width * 0.6 && blob.y1 - blob.y0 < image.height * 0.25,
  );
  if (blobs.length === 0) return [];

  // Height of tall letters (alif, lam): dots and harakat are far more numerous than letter
  // bodies, so a lower percentile would be a mark's height.
  const heights = blobs.map((blob) => blob.y1 - blob.y0).sort((a, b) => a - b);
  const letterHeight = heights[Math.floor(heights.length * 0.95)];
  const isBody = (blob: Blob) => blob.y1 - blob.y0 >= letterHeight * 0.4 || blob.x1 - blob.x0 >= letterHeight;
  const bodies = blobs.filter(isBody);
  const allLines = groupIntoLines(bodies, letterHeight);
  // A "line" with no full-height letter is a row of harakat or dots that got separated.
  const lines = allLines.filter((line) => line.bodies.some((body) => body.y1 - body.y0 >= letterHeight * 0.6));
  const marks = [...blobs.filter((blob) => !isBody(blob)), ...allLines.filter((line) => !lines.includes(line)).flatMap((line) => line.bodies)];
  attachMarks(lines, marks, letterHeight);

  const wordGap = learnWordGap(lines, letterHeight);
  // A "word" that is both short and has very little ink is punctuation (، ؛ .) — nothing to read.
  // Height alone can't tell: short words without tall letters (مِنْ فِي) are about comma height.
  return lines
    .flatMap((line) => splitIntoWords(line, wordGap))
    .filter((word) => word.tallest >= letterHeight * 0.5 || word.ink >= letterHeight * letterHeight * 0.08);
}

/**
 * Gaps between neighbouring letter groups come in two sizes: inside a word (after letters that
 * don't connect, like ا د ر و) and between words. Splits them into those two clusters (Otsu's
 * method), so the threshold adapts to the font and scan resolution. The split is done on the
 * log of the gaps: justified lines have a few extra-wide gaps, and on raw sizes those outliers
 * pull the threshold up past most real word gaps.
 */
function learnWordGap(lines: Line[], letterHeight: number): number {
  const gaps = lines.flatMap((line) => {
    const sorted = [...line.bodies].sort((a, b) => b.x1 - a.x1);
    const lineGaps: number[] = [];
    let left = sorted[0]?.x0 ?? 0;
    for (const body of sorted.slice(1)) {
      if (left - body.x1 > 0) lineGaps.push(left - body.x1);
      left = Math.min(left, body.x0);
    }
    return lineGaps;
  });
  const fallback = letterHeight * fallbackWordGapRatio;
  if (gaps.length < 8) return fallback;

  const sorted = [...gaps].sort((a, b) => a - b);
  const logs = sorted.map(Math.log);
  let best = -1;
  let threshold = fallback;
  for (let split = 1; split < logs.length; split += 1) {
    if (sorted[split] === sorted[split - 1]) continue;
    const small = logs.slice(0, split);
    const large = logs.slice(split);
    const meanSmall = small.reduce((sum, gap) => sum + gap, 0) / small.length;
    const meanLarge = large.reduce((sum, gap) => sum + gap, 0) / large.length;
    const separation = small.length * large.length * (meanLarge - meanSmall) ** 2;
    if (separation > best) {
      best = separation;
      threshold = (sorted[split - 1] + sorted[split]) / 2;
    }
  }
  return Math.min(Math.max(threshold, letterHeight * 0.08), letterHeight * 0.6);
}

function findInkBlobs({ width, height, data }: { width: number; height: number; data: Uint8ClampedArray }): Blob[] {
  const gray = new Uint8Array(width * height);
  const histogram = new Array<number>(256).fill(0);
  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    const offset = pixel * 4;
    const value = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
    gray[pixel] = value;
    histogram[value] += 1;
  }

  const threshold = otsuThreshold(histogram, gray.length);
  const ink = new Uint8Array(gray.length);
  let inkCount = 0;
  for (let pixel = 0; pixel < gray.length; pixel += 1) {
    if (gray[pixel] < threshold) {
      ink[pixel] = 1;
      inkCount += 1;
    }
  }
  // Light text on a dark background: flip so text is the ink.
  if (inkCount > gray.length / 2) ink.forEach((value, pixel) => (ink[pixel] = value ? 0 : 1));

  // Connected components (8-neighbour) via union-find over a single pass.
  const labels = new Int32Array(gray.length).fill(-1);
  const parent: number[] = [];
  const find = (label: number): number => {
    while (parent[label] !== label) {
      parent[label] = parent[parent[label]];
      label = parent[label];
    }
    return label;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      if (!ink[pixel]) continue;
      let label = -1;
      const neighbours = [x > 0 ? pixel - 1 : -1, y > 0 && x > 0 ? pixel - width - 1 : -1, y > 0 ? pixel - width : -1, y > 0 && x < width - 1 ? pixel - width + 1 : -1];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || labels[neighbour] < 0) continue;
        const neighbourLabel = find(labels[neighbour]);
        if (label < 0) label = neighbourLabel;
        else if (neighbourLabel !== label) parent[Math.max(label, neighbourLabel)] = Math.min(label, neighbourLabel);
        label = find(label);
      }
      if (label < 0) {
        label = parent.length;
        parent.push(label);
      }
      labels[pixel] = label;
    }
  }

  const blobsByLabel = new Map<number, Blob>();
  for (let pixel = 0; pixel < labels.length; pixel += 1) {
    if (labels[pixel] < 0) continue;
    const root = find(labels[pixel]);
    const x = pixel % width;
    const y = (pixel - x) / width;
    const blob = blobsByLabel.get(root);
    if (blob) {
      blob.x0 = Math.min(blob.x0, x);
      blob.x1 = Math.max(blob.x1, x + 1);
      blob.y0 = Math.min(blob.y0, y);
      blob.y1 = Math.max(blob.y1, y + 1);
      blob.area += 1;
    } else {
      blobsByLabel.set(root, { x0: x, y0: y, x1: x + 1, y1: y + 1, area: 1 });
    }
  }
  return [...blobsByLabel.values()];
}

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  histogram.forEach((count, value) => (sum += count * value));
  let backgroundSum = 0;
  let backgroundCount = 0;
  let best = 0;
  let threshold = 128;

  histogram.forEach((count, value) => {
    backgroundCount += count;
    if (backgroundCount === 0 || backgroundCount === total) return;
    backgroundSum += count * value;
    const foregroundCount = total - backgroundCount;
    const meanDifference = backgroundSum / backgroundCount - (sum - backgroundSum) / foregroundCount;
    const variance = backgroundCount * foregroundCount * meanDifference * meanDifference;
    if (variance > best) {
      best = variance;
      threshold = value + 1;
    }
  });
  return threshold;
}

function groupIntoLines(bodies: Blob[], bodyHeight: number): Line[] {
  const lines: Line[] = [];
  const centerOf = (blob: Blob) => (blob.y0 + blob.y1) / 2;

  for (const body of [...bodies].sort((a, b) => centerOf(a) - centerOf(b))) {
    const line = lines.find((candidate) => Math.abs(candidate.centerY - centerOf(body)) < bodyHeight * 0.5);
    if (line) {
      line.bodies.push(body);
      line.centerY += (centerOf(body) - line.centerY) / line.bodies.length;
    } else {
      lines.push({ bodies: [body], marks: [], centerY: centerOf(body) });
    }
  }
  return lines.sort((a, b) => a.centerY - b.centerY);
}

/** Dots and harakat belong to the line they're vertically closest to (and horizontally within). */
function attachMarks(lines: Line[], marks: Blob[], bodyHeight: number): void {
  for (const mark of marks) {
    const centerY = (mark.y0 + mark.y1) / 2;
    let best: Line | null = null;
    let bestDistance = bodyHeight * 1.2;
    for (const line of lines) {
      const x0 = Math.min(...line.bodies.map((body) => body.x0)) - bodyHeight;
      const x1 = Math.max(...line.bodies.map((body) => body.x1)) + bodyHeight;
      if (mark.x1 < x0 || mark.x0 > x1) continue;
      const distance = Math.abs(centerY - line.centerY);
      if (distance < bestDistance) {
        best = line;
        bestDistance = distance;
      }
    }
    best?.marks.push(mark);
  }
}

function splitIntoWords(line: Line, wordGap: number): Array<PixelWordBox & { tallest: number; ink: number }> {
  const members = [...line.bodies, ...line.marks];
  const lineRect = {
    x0: Math.min(...members.map((blob) => blob.x0)),
    y0: Math.min(...members.map((blob) => blob.y0)),
    x1: Math.max(...members.map((blob) => blob.x1)),
    y1: Math.max(...members.map((blob) => blob.y1)),
  };

  const words: Array<{ x0: number; x1: number; tallest: number; ink: number }> = [];
  for (const body of [...line.bodies].sort((a, b) => b.x1 - a.x1)) {
    const word = words[words.length - 1];
    if (word && word.x0 - body.x1 <= wordGap) {
      word.x0 = Math.min(word.x0, body.x0);
      word.tallest = Math.max(word.tallest, body.y1 - body.y0);
      word.ink += body.area;
    } else {
      words.push({ x0: body.x0, x1: body.x1, tallest: body.y1 - body.y0, ink: body.area });
    }
  }

  // Marks inside a word's span join it (a kasra under its last letter can overhang). A mark in a
  // gap joins the word on its right — the one before it in reading order — since Arabic words end
  // with a free-standing hamza (يَشَاءُ) but never start with one.
  for (const mark of line.marks) {
    const centerX = (mark.x0 + mark.x1) / 2;
    const containing = words.find((candidate) => centerX >= candidate.x0 - 2 && centerX <= candidate.x1 + 2);
    const toRight = words
      .filter((candidate) => candidate.x0 > centerX)
      .reduce<{ x0: number; x1: number } | null>((nearest, candidate) => (!nearest || candidate.x0 < nearest.x0 ? candidate : nearest), null);
    const word = containing ?? (toRight && toRight.x0 - mark.x1 <= wordGap * 2 ? toRight : null);
    if (word) {
      word.x0 = Math.min(word.x0, mark.x0);
      word.x1 = Math.max(word.x1, mark.x1);
    }
  }

  return words.map((word) => ({
    text: "",
    x0: word.x0,
    x1: word.x1,
    y0: lineRect.y0,
    y1: lineRect.y1,
    line: lineRect,
    tallest: word.tallest,
    ink: word.ink,
  }));
}
