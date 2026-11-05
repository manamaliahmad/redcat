# crawl4ai-js-render

When to use: a site returns thin or empty content from browser_read or deep_read (JavaScript-heavy / single-page app), and the user needs its real rendered content.

What it is: Crawl4AI — free, open-source Python crawler. It drives a real Chromium browser (Playwright), waits for JavaScript, then returns clean Markdown: nav, header, footer stripped, main content kept, structure preserved.

Install (these are write commands — the user approves them first):
1. `python -m pip install -U crawl4ai`
2. `crawl4ai-setup` (downloads the browser once, about 150MB)
3. `crawl4ai-doctor` (checks the install)

Use (one page, Markdown out):
- Shell: `crwl https://example.com -o markdown`
- Python: `from crawl4ai import AsyncWebCrawler` then `async with AsyncWebCrawler() as crawler: result = await crawler.arun(url)` and read `result.markdown`.

Rules: only pages the user asked for; never save keys in a skill or script; if install fails, tell the user the exact error instead of faking output.
