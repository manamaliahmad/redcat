// REFFLOW-SYSTEM-BLOCK - reference-URL flow + depth-portrait recipe (ADDITIVE ONLY).
// Holds the short flow block that server.js appends in agentSystemText
// (REFFLOW-HOOK), mirroring the ADOPT/INVENTORY/VISION pattern. The block
// is static guidance text only: it points the model at the existing
// skills (site-to-design, collect-inputs, design-to-site), the existing
// analyze-site.js script (run via the existing terminal_exec tool), and
// the existing depth-portrait recipe. It adds no tool, no endpoint, and
// no prompt-text change: the base prompt text stays byte-identical.
const SYSTEM_BLOCK = 'REFERENCE-FLOW (a pasted link becomes an ORIGINAL site, never a copy): when the user pastes a website URL and asks for a site like it, in that style, or inspired by it: (1) skill_read site-to-design, then run node analyze-site.js <url> via terminal_exec from the project root and read runs/refflow/analysis.json plus its screenshots - never re-scrape by hand, never bypass a robots.txt or login refusal; (2) write design.md from the skill template and get it approved before any build; (3) skill_read collect-inputs and send ONE message asking for everything at once (photo, name, tagline, services, images, colours/logo), with a skip option - skip means a MARKED placeholder, never an invented business fact; (4) after approval and inputs, skill_read design-to-site and build the ORIGINAL site from design.md using references/pattern-map.md: tokens to CSS, sections in design.md order, user content into slots. For the 3D depth portrait pattern the build target is recipes/depth-portrait-scroll - edit ONLY template/src/config.json, never the shader, camera code, or template structure - then run its scripts/check.js. Verify the built site against design.md only, never by pixel-diff against the reference, and never use the reference images, copy, logo, brand, or exact pixels. Publish only on explicit user approval.';
module.exports = { SYSTEM_BLOCK };
