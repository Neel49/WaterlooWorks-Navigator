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


1. Go to https://chromewebstore.google.com/detail/waterlooworks-job-navigat/cgbnoaajkhcbdlinacekhheahdkgkdpj

2. Click on **Add to Chrome** 
   
3. **In WaterlooWorks**: Create a folder called "shortlist" in your My Jobs section

4. Done!

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
