# NEWTAB3 development

This is a buildless HTML/CSS/JavaScript app. Run `node tests/core.test.cjs` and syntax checks for changed JavaScript. Serve the repository with `python3 -m http.server 8000 --bind 127.0.0.1` and validate UI changes in a real browser at desktop and compact widths. Preserve existing localStorage settings and migration support.

## Design reviews and implementation

Follow [apple-design](.design-rules/SKILL.md). Route topics with `.design-rules/references/hig-lookup.md` and load the relevant `.design-rules/references/hig/*.md` files before design feedback or changes. Apply HIG principles to this web app using CSS tokens, semantic HTML and accessible interactions; do not imitate native window chrome. Keep the skill submodule unchanged.

Initialize the skill after cloning with `git submodule update --init .design-rules`.
