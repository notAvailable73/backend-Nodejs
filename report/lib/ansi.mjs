// Converts terminal output with ANSI colour codes (SGR) to HTML spans.
const COLOURS = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

export const escapeHtml = (text) =>
    text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

export const ansiToHtml = (text) => {
    let html = "";
    let state = { fg: null, bg: null, bold: false, dim: false };
    let open = false;
    const openSpan = () => {
        const classes = [];
        if (state.fg) classes.push(`fg-${state.fg}`);
        if (state.bg) classes.push(`bg-${state.bg}`);
        if (state.bold) classes.push("b");
        if (state.dim) classes.push("dim");
        if (classes.length) {
            html += `<span class="${classes.join(" ")}">`;
            open = true;
        }
    };
    const closeSpan = () => {
        if (open) html += "</span>";
        open = false;
    };
    // Drop non-colour escape sequences (cursor movement, etc.)
    const cleaned = text.replace(/\x1b\[[0-9;?]*[A-Za-ln-z]/g, "").replace(/\r/g, "");
    const parts = cleaned.split(/\x1b\[([0-9;]*)m/);
    parts.forEach((part, i) => {
        if (i % 2 === 0) {
            html += escapeHtml(part);
            return;
        }
        const codes = part === "" ? [0] : part.split(";").map(Number);
        for (let j = 0; j < codes.length; j++) {
            const c = codes[j];
            if (c === 0) state = { fg: null, bg: null, bold: false, dim: false };
            else if (c === 1) state.bold = true;
            else if (c === 2) state.dim = true;
            else if (c === 22) state.bold = state.dim = false;
            else if (c >= 30 && c <= 37) state.fg = COLOURS[c - 30];
            else if (c >= 90 && c <= 97) state.fg = `bright-${COLOURS[c - 90]}`;
            else if (c === 39) state.fg = null;
            else if (c >= 40 && c <= 47) state.bg = COLOURS[c - 40];
            else if (c >= 100 && c <= 107) state.bg = `bright-${COLOURS[c - 100]}`;
            else if (c === 49) state.bg = null;
            else if (c === 38 || c === 48) j += codes[j + 1] === 5 ? 2 : 4; // 256/true colour: ignore
        }
        closeSpan();
        openSpan();
    });
    closeSpan();
    return html;
};

export const stripAnsi = (text) => text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
