import { createRoot } from "react-dom/client";
import App from "./App";
import { NativeBoard } from "./native/NativeBoard";
import { NativeHandle } from "./native/NativeHandle";
import { isNative, TauriBackend } from "./native/tauriBackend";
import "./styles/tokens.css";
import "./styles/handle.css";
import "./styles/board.css";
import "./styles/controls.css";

const root = createRoot(document.getElementById("root")!);
const which = new URLSearchParams(location.search).get("w");
if (isNative() && which === "handle") {
  document.documentElement.dataset.native = "handle"; root.render(<NativeHandle />);
} else if (isNative() && which === "board") {
  document.documentElement.dataset.native = "board";
  const backend = new TauriBackend();
  backend.init().then((info) => { document.documentElement.dataset.backdrop = info.backdrop; root.render(<NativeBoard backend={backend} />); });
} else {
  document.body.classList.add("dev"); // browser preview: wallpaper behind the glass
  root.render(<App />);
}
