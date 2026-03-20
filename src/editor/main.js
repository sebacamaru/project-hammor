import "./shared/styles/global.css";
import "./shell/styles/shell.css";

import { EditorShell } from "./shell/EditorShell.js";
import { MapEditorApp } from "./workspaces/map/MapEditorApp.js";
import { WorldEditorApp } from "./workspaces/world/WorldEditorApp.js";
import { DatabaseEditorApp } from "./workspaces/database/DatabaseEditorApp.js";

const root = document.getElementById("editor");
const shell = new EditorShell(root);

shell.registerWorkspace("map", "Map", () => new MapEditorApp());
shell.registerWorkspace("world", "World", () => new WorldEditorApp());
shell.registerWorkspace("database", "Database", () => new DatabaseEditorApp());

shell.switchTo("map");
