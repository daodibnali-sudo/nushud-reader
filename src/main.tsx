import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Without this, dropping a file anywhere outside the upload drop zone makes the
// browser navigate to open it directly instead of leaving that to our own handler.
["dragover", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (event) => {
    event.preventDefault();
  });
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
