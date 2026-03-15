# Browser Automation Skill

This skill provides the agent with browser automation capabilities for web research,
data extraction, and form interaction.

## Capabilities

- **Navigate**: Open URLs and navigate web pages
- **Extract Content**: Read text, tables, and structured data from pages
- **Screenshot**: Capture screenshots of web pages
- **Search**: Perform web searches and return results
- **Fill Forms**: Interact with web forms and input fields

## Tools

### browse_url
Navigate to a URL and extract the page content.
- **Parameters**: `url` (string), `extract` (text|html|markdown, default: markdown)
- **Returns**: Page title, URL, and extracted content

### search_web
Perform a web search query.
- **Parameters**: `query` (string), `num_results` (number, default 5)
- **Returns**: Array of search results with title, url, and snippet

### screenshot_page
Take a screenshot of a web page.
- **Parameters**: `url` (string), `full_page` (boolean, default: false)
- **Returns**: Screenshot as base64 image data

### extract_table
Extract tabular data from a web page.
- **Parameters**: `url` (string), `selector` (CSS selector for the table)
- **Returns**: Table data as array of objects

## Context

Use these tools when users need information from the web, want to research
companies or contacts, or need to verify online information. Exercise caution
with URLs and never submit sensitive data through forms without explicit user consent.
