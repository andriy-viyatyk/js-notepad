// Persephone Boards — Demo board, "Notes" secondary view (loaded via board:///detail.js).
//
// A STANDALONE secondary-view script, independent of app.js. It shares the board's state with
// the main view and the "Shared State" panel via persephone.state.* — editing the textarea
// here updates the other frames live, and their changes appear here. The main view owns the
// authoritative state.init(); this frame only reads + writes.
(() => {
    const P = window.persephone;
    const notes = document.getElementById("notes");
    const readout = document.getElementById("notes-readout");

    // Write on input; onChange (below) is the source of truth for rendering.
    notes.addEventListener("input", () => P.state.merge({ message: notes.value }));

    P.state.onChange((s) => {
        readout.textContent = "shared state: " + JSON.stringify(s);
        // Reflect an external change without stealing the caret while the user types here.
        if (document.activeElement !== notes && typeof s.message === "string") notes.value = s.message;
    });
})();
