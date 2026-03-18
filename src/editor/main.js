import "./styles/editor.css";
import { EditorApp } from "./EditorApp.js";

const root = document.getElementById("editor");
const app = new EditorApp(root);
app.start();
