import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { PRODUCT_NAME } from "./config/brand";
import "./index.css";
import { AppErrorBoundary, initMonitoring } from "./monitoring";

initMonitoring();

document.title = `${PRODUCT_NAME} · Panel administrativo`;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
