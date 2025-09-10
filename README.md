# WaterlooWorks Job Navigator

Chrome extension that adds keyboard navigation and UI improvements to WaterlooWorks job postings.

## Features

- **Arrow Keys / WASD Navigation**:
  - Left/A: Previous job
  - Right/D: Next job
  - Up/W: Toggle Shortlist/Unshortlist job
  - Escape: Close modal

- **Enhanced UI**:
  - Rearrangeable sections (drag and drop)
  - Collapsible sections
  - Your preferences are saved

## What it should look like

![WaterlooWorks Navigator Screenshot](Screenshot_1.png)

## Installation

1. **In WaterlooWorks**: Create a folder called "shortlist" in your My Jobs section

2. **Download this folder** to your computer

3. **Open Chrome** and go to `chrome://extensions/`

4. **Enable Developer Mode** (top-right toggle)

5. **Click "Load unpacked"** and select this folder

6. Done!

## How to Use

1. Go to WaterlooWorks job search page
2. Click any job or the purple button (bottom-right)
3. Navigate with arrows or WASD:
   - Left/A: Previous job
   - Right/D: Next job
   - Up/W: Shortlist job
   - Escape: Close
4. Drag sections to reorder
5. Click arrows to collapse/expand sections

## Troubleshooting

- Refresh the page after installing
- Make sure you're on WaterlooWorks job search page
- To reset preferences: F12 → Console → `localStorage.removeItem('ww-navigator-prefs')`

## Files

- `manifest.json` - Extension configuration
- `content.js` - Main logic
- `README.md` - This file
