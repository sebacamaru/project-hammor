/**
 * Client-side interaction presentation layer.
 * Routes interaction results from the server to the appropriate UI.
 * Currently supports "text" interactions via GameMessageBox.
 */
export class InteractionPresenter {
  /**
   * @param {import("../ui/GameMessageBox.js").GameMessageBox} messageBox
   */
  constructor(messageBox) {
    this._messageBox = messageBox;
  }

  /**
   * Presents an interaction result to the player.
   * Resolves when the player has dismissed the UI (for blocking types like text).
   * Logs a warning and returns for invalid or unsupported result types.
   * @param {object} result - Server interaction result payload.
   * @returns {Promise<void>}
   */
  async present(result) {
    if (!result || !result.interactionType) {
      console.warn("[InteractionPresenter] Invalid interaction result", result);
      return;
    }

    switch (result.interactionType) {
      case "text":
        await this._messageBox.show({ text: result.text });
        break;
      default:
        console.warn(`[InteractionPresenter] Unsupported type: "${result.interactionType}"`);
    }
  }
}
