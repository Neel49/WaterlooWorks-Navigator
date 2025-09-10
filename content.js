console.log("WaterlooWorks Navigator - Loading extension v43.0 (Complete Content Fix)...");

/**
 * SHORTLIST FEATURE v43:
 * Stars appear in BOTH the job listing table AND modal views!
 * 
 * How it works:
 * 1. Each job has its actual ID from WaterlooWorks (e.g., "435669")
 * 2. Stars appear on the RIGHT side of job titles in the table (☆ = not shortlisted, ⭐ = shortlisted)
 * 3. Click stars in the table for quick shortlisting without opening jobs
 * 4. Stars also appear in the modal when you open a job
 * 5. All stars sync together and persist using localStorage
 * 
 * IMPORTANT: By default, ALL jobs start as NOT shortlisted (empty star ☆)
 * 
 * Controls:
 * - Click any ☆/⭐ star to toggle shortlist (in table or modal)
 * - Press Up Arrow in modal to toggle via WaterlooWorks integration
 * - Press Ctrl+Shift+C to clear ALL shortlists (reset everything)
 * - Stars persist across page refreshes and browser sessions
 */

// Global variables
let jobLinks = [];
let currentJobIndex = -1;
let sectionOrder = [];
let collapsedSections = {};
let fieldOrder = {};
let collapsedFields = {};
let dualColumnEnabled = {}; // Track whether dual column layout is enabled for each panel
let isEnhancing = false;
let modalObserver = null;
// Track shortlisted jobs (persisted to localStorage)
let shortlistedJobs = new Set();
// Track the ACTUAL job ID when a modal is opened
let currentModalJobId = null;

// Load saved preferences
function loadPreferences() {
  try {
    const saved = localStorage.getItem('ww-navigator-prefs');
    if (saved) {
      const prefs = JSON.parse(saved);
      sectionOrder = prefs.sectionOrder || [];
      collapsedSections = prefs.collapsedSections || {};
      fieldOrder = prefs.fieldOrder || {};
      collapsedFields = prefs.collapsedFields || {};
      dualColumnEnabled = prefs.dualColumnEnabled || {};
      
      // Migrate old field order format to new columns format
      let migrated = false;
      for (const panelTitle in fieldOrder) {
        const order = fieldOrder[panelTitle];
        // Check if it's the old array format
        if (Array.isArray(order)) {
          console.log(`Migrating old field order format for ${panelTitle}`);
          fieldOrder[panelTitle] = {
            columns: {
              left: order,
              right: []
            }
          };
          migrated = true;
        }
      }
      
      if (migrated) {
        savePreferences();
        console.log('Migrated field order to new format');
      }
      
      console.log('Loaded preferences:', prefs);
    }
    
    // Load shortlisted jobs
    const savedShortlist = localStorage.getItem('ww-navigator-shortlist');
    if (savedShortlist) {
      const parsed = JSON.parse(savedShortlist);
      // Convert old format (job_XXXXX) to new format (just XXXXX)
      const cleanedJobs = parsed.map(id => {
        if (typeof id === 'string' && id.startsWith('job_')) {
          return id.substring(4); // Remove "job_" prefix
        }
        return id;
      }).filter(id => /^\d+$/.test(String(id))); // Only keep pure numbers
      
      shortlistedJobs = new Set(cleanedJobs);
      console.log(`Loaded ${shortlistedJobs.size} shortlisted jobs from localStorage`);
      
      // Save cleaned version if we made changes
      if (cleanedJobs.length !== parsed.length || cleanedJobs.some((id, i) => id !== parsed[i])) {
        console.log(`Cleaned up job ID format`);
        saveShortlist();
      }
    }
  } catch (e) {
    console.error('Error loading preferences:', e);
  }
}

// Save preferences
function savePreferences() {
  try {
    const prefs = {
      sectionOrder: sectionOrder,
      collapsedSections: collapsedSections,
      fieldOrder: fieldOrder,
      collapsedFields: collapsedFields,
      dualColumnEnabled: dualColumnEnabled
    };
    localStorage.setItem('ww-navigator-prefs', JSON.stringify(prefs));
  } catch (e) {
    console.error('Error saving preferences:', e);
  }
}

// Removed - No local storage for shortlist

// Get all job links and add stars to table rows
function getAllJobLinks() {
  // Try multiple selectors to find job links
  let links = document.querySelectorAll('tbody[data-v-612a1958] a[href="javascript:void(0)"].overflow--ellipsis');
  
  // Fallback: Try without the data-v attribute
  if (links.length === 0) {
    console.log('Primary selector failed, trying fallback...');
    links = document.querySelectorAll('tbody a.overflow--ellipsis');
  }
  
  // Another fallback: Any links in table rows
  if (links.length === 0) {
    console.log('Secondary selector failed, trying broader search...');
    links = document.querySelectorAll('tr a[href*="javascript"]');
  }
  
  jobLinks = Array.from(links);
  console.log(`Found ${jobLinks.length} job postings`);
  
  if (jobLinks.length === 0) {
    console.error('ERROR: No job links found! Page structure may have changed.');
    console.log('Available tables:', document.querySelectorAll('table').length);
    console.log('Available tbody:', document.querySelectorAll('tbody').length);
    console.log('Available links:', document.querySelectorAll('a').length);
  }
  
  // Add stars to each table row
  links.forEach((link, index) => {
    const row = link.closest('tr');
    if (row) {
      console.log(`Adding star to row ${index + 1}`);
      addStarToTableRow(row);
    } else {
      console.log(`Warning: No row found for link ${index + 1}`);
    }
  });
  
  return jobLinks;
}

// Add a star indicator to a table row
function addStarToTableRow(row) {
  // Don't add if already exists
  if (row.querySelector('.ww-row-star')) {
    console.log('Star already exists in row');
    return;
  }
  
  const jobId = getJobIdFromRow(row);
  if (!jobId) {
    console.log('No job ID found for row');
    return;
  }
  
  const isShortlisted = shortlistedJobs.has(jobId);
  console.log(`Job ${jobId} shortlisted status: ${isShortlisted}`);
  
  // Find the job title cell - try multiple selectors
  let titleLink = row.querySelector('td a.overflow--ellipsis');
  if (!titleLink) {
    titleLink = row.querySelector('a[href*="javascript"]');
  }
  if (!titleLink) {
    console.log('No title link found in row');
    return;
  }
  
  const titleCell = titleLink.closest('td');
  if (!titleCell) {
    console.log('No title cell found');
    return;
  }
  
  // Create star button with inline styles to ensure visibility
  const star = document.createElement('span');
  star.className = 'ww-row-star';
  star.innerHTML = isShortlisted ? '⭐' : '☆';
  star.title = isShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
  
  // Add inline styles - simple absolute positioning
  star.style.cssText = `
    position: absolute !important;
    right: 15px !important;
    top: 50% !important;
    transform: translateY(-50%) !important;
    font-size: 18px !important;
    cursor: pointer !important;
    color: ${isShortlisted ? '#ffd700' : '#999'} !important;
    z-index: 10 !important;
  `;
  
  star.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Toggle in our tracking
    if (shortlistedJobs.has(jobId)) {
      shortlistedJobs.delete(jobId);
      star.innerHTML = '☆';
      star.title = 'Add to shortlist';
    } else {
      shortlistedJobs.add(jobId);
      star.innerHTML = '⭐';
      star.title = 'Remove from shortlist';
    }
    
    saveShortlist();
    console.log(`Toggled shortlist for job ${jobId} from table row`);
    
    // If modal is open for this job, update its star too
    if (getCurrentJobId() === jobId) {
      updateShortlistIndicator();
    }
  });
  
  // Find the container div inside the td and append star
  const containerDiv = titleCell.querySelector('div');
  
  try {
    if (containerDiv) {
      console.log(`Appending star to container div for job ${jobId}`);
      containerDiv.appendChild(star);
    } else {
      console.log(`Appending star directly to td for job ${jobId}`);
      titleCell.appendChild(star);
    }
    console.log(`✅ Star added successfully for job ${jobId}`);
  } catch (error) {
    console.error('ERROR adding star:', error);
  }
}

// Update all table row stars
function updateTableRowStars() {
  const rows = document.querySelectorAll('tbody[data-v-612a1958] tr');
  rows.forEach(row => {
    const star = row.querySelector('.ww-row-star');
    if (star) {
      const jobId = getJobIdFromRow(row);
      if (jobId) {
        const isShortlisted = shortlistedJobs.has(jobId);
        star.innerHTML = isShortlisted ? '⭐' : '☆';
        star.title = isShortlisted ? 'Remove from shortlist' : 'Add to shortlist';
        // Update inline color to ensure visibility
        star.style.color = isShortlisted ? '#ffd700' : '#999';
      }
    }
  });
}

// Check if modal is open
function isModalOpen() {
  return document.querySelector('div[data-v-70e7ded6-s]') !== null;
}

// Get job ID from the clicked row (from table)
function getJobIdFromRow(row) {
  // Method 1: Look for checkbox with job ID as value
  const checkbox = row.querySelector('input[type="checkbox"][name="dataViewerSelection"]');
  if (checkbox && checkbox.value) {
    console.log(`Found job ID from checkbox: ${checkbox.value}`);
    return checkbox.value; // This is the actual job ID like "435669"
  }
  
  // Method 2: Look for job ID in the first column
  const firstTh = row.querySelector('th');
  if (firstTh) {
    // Look for spans with numbers
    const spans = firstTh.querySelectorAll('span');
    for (const span of spans) {
      const text = span.textContent.trim();
      if (/^\d{6}$/.test(text)) {
        console.log(`Found job ID from span: ${text}`);
        return text;
      }
    }
  }
  
  // Method 3: Look for any 6-digit number in the row
  const rowText = row.textContent;
  const match = rowText.match(/\b\d{6}\b/);
  if (match) {
    console.log(`Found job ID from row text: ${match[0]}`);
    return match[0];
  }
  
  console.log('Could not find job ID in row');
  return null;
}

// Get current job ID from modal (uses the stored ID from when modal was opened)
function getCurrentJobId() {
  // CRITICAL: Use the stored job ID from when the modal was opened
  if (currentModalJobId) {
    console.log(`Using stored modal job ID: ${currentModalJobId}`);
    return currentModalJobId;
  }
  
  // Fallback: If somehow we don't have the stored ID, try to get it from current index
  if (currentJobIndex >= 0 && jobLinks[currentJobIndex]) {
    const row = jobLinks[currentJobIndex].closest('tr');
    if (row) {
      const id = getJobIdFromRow(row);
      if (id) {
        console.log(`Using job ID from current index ${currentJobIndex}: ${id}`);
        currentModalJobId = id; // Store it for future use
        return id;
      }
    }
  }
  
  console.log('ERROR: Could not determine current job ID!');
  return null;
}

// Save shortlisted jobs to localStorage
function saveShortlist() {
  try {
    localStorage.setItem('ww-navigator-shortlist', JSON.stringify(Array.from(shortlistedJobs)));
    console.log(`Saved ${shortlistedJobs.size} shortlisted jobs to localStorage`);
  } catch (e) {
    console.error('Error saving shortlist:', e);
  }
}

// Show notification for shortlist actions
function showNotification(message, type = 'add') {
  const existing = document.getElementById('ww-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'ww-notification';
  notification.textContent = message;
  
  let background, icon;
  if (type === 'add') {
    background = 'linear-gradient(135deg, #4caf50, #8bc34a)';
    icon = '⭐';
  } else if (type === 'remove') {
    background = 'linear-gradient(135deg, #f44336, #ff9800)';
    icon = '☆';
  } else if (type === 'error') {
    background = 'linear-gradient(135deg, #d32f2f, #c62828)';
    icon = '❌';
  } else {
    background = 'linear-gradient(135deg, #757575, #424242)';
    icon = 'ℹ️';
  }
  
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: ${background};
    color: white;
    padding: 20px 32px;
    border-radius: 12px;
    font-size: 18px;
    font-weight: bold;
    z-index: 1000002;
    box-shadow: 0 6px 30px rgba(0,0,0,0.4);
    animation: notificationPulse 0.5s ease;
    display: flex;
    align-items: center;
    gap: 10px;
  `;
  
  // Add icon to notification
  notification.innerHTML = `${icon} ${message}`;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 1500);
}

// Helper function to wait for element with specific content
async function waitForElementWithText(text, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    // First try to find p.label elements specifically (from user's HTML)
    const labelPs = document.querySelectorAll('p.label');
    for (const p of labelPs) {
      if (p.textContent.trim().toLowerCase() === text.toLowerCase()) {
        console.log(`✓ Found p.label with "${text}"!`);
        return p;
      }
    }
    
    // Then try any p tag
    const allPs = document.querySelectorAll('p');
    for (const p of allPs) {
      if (p.textContent.trim().toLowerCase() === text.toLowerCase()) {
        console.log(`✓ Found p tag with "${text}"!`);
        return p;
      }
    }
    
    // Finally try any small element
    const allElements = document.querySelectorAll('*');
    for (const elem of allElements) {
      // Check for direct text content (not from children)
      const directText = Array.from(elem.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .join(' ');
      
      if (directText.toLowerCase() === text.toLowerCase()) {
        console.log(`✓ Found ${elem.tagName} with direct text "${text}"!`);
        return elem;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`Timeout: Could not find element with text "${text}"`);
  return null;
}

// Toggle shortlist for current job IN WATERLOOWORKS
async function toggleShortlist() {
  const jobId = getCurrentJobId();
  if (!jobId) {
    console.log('No job ID found');
    return;
  }
  
  const modal = document.querySelector('div[data-v-70e7ded6-s]');
  const jobTitle = modal?.querySelector('h4')?.textContent?.trim();
  console.log(`Toggling shortlist for: "${jobTitle}" (ID: ${jobId})`);
  
  // CRITICAL: Select the correct row in the table first!
  // WaterlooWorks uses the selected row to determine which job's folder to show
  const allRows = document.querySelectorAll('tbody[data-v-612a1958] tr');
  let foundRow = null;
  
  for (const row of allRows) {
    const rowJobId = getJobIdFromRow(row);
    if (rowJobId === jobId) {
      foundRow = row;
      // The checkbox has name="dataViewerSelection" and value is the job ID
      const checkbox = row.querySelector('input[type="checkbox"][name="dataViewerSelection"]');
      if (checkbox) {
        console.log(`Found checkbox with value: ${checkbox.value}`);
        if (!checkbox.checked) {
          console.log(`Selecting row for job ${jobId} to sync with WaterlooWorks`);
          checkbox.checked = true;
          // Trigger both change and click events to ensure WaterlooWorks registers it
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
          checkbox.dispatchEvent(new Event('click', { bubbles: true }));
          // Wait for WaterlooWorks to register the selection
          await new Promise(resolve => setTimeout(resolve, 300));
        } else {
          console.log('Row already selected');
        }
      } else {
        console.log('WARNING: No checkbox found in row');
      }
      break;
    }
  }
  
  if (!foundRow) {
    console.error(`ERROR: Could not find table row for job ${jobId}`);
    showNotification('Cannot find job in table - try refreshing', 'error');
    return;
  }
  
  // Check if currently shortlisted
  const isCurrentlyShortlisted = shortlistedJobs.has(jobId);
  
  // CRITICAL: The folder button is in the TABLE ROW, not the modal!
  console.log('Looking for folder button in the table row...');
  
  let folderButton = null;
  
  // Find the folder button in the selected row
  if (foundRow) {
    // Look for the folder button in this specific row
    const rowButtons = foundRow.querySelectorAll('button');
    console.log(`Found ${rowButtons.length} buttons in the row`);
    
    for (const btn of rowButtons) {
      // Check both the button's aria-label and icon
      const ariaLabel = btn.getAttribute('aria-label');
      const icon = btn.querySelector('i.material-icons');
      
      if (ariaLabel) {
        console.log(`  Button aria-label: "${ariaLabel}"`);
      }
      
      if (icon) {
        const iconText = icon.textContent.trim();
        console.log(`  Button icon: "${iconText}"`);
        
        // Looking for folder-related buttons
        if (iconText === 'folder_open' || 
            iconText === 'create_new_folder' || 
            (ariaLabel && ariaLabel.toLowerCase().includes('folder'))) {
          folderButton = btn;
          console.log('✓ Found folder button in table row!');
          break;
        }
      }
    }
  }
  
  // Fallback: Try searching in modal if not found in row
  if (!folderButton) {
    console.log('Folder button not in row, searching modal...');
    let buttonSearchAttempts = 0;
    
    while (buttonSearchAttempts < 5 && !folderButton) {
      const modalArea = document.querySelector('div[data-v-70e7ded6-s]');
      if (modalArea) {
        const allButtons = modalArea.querySelectorAll('button');
        console.log(`Attempt ${buttonSearchAttempts + 1}: Found ${allButtons.length} total buttons in modal`);
      
      // Find the create_new_folder button
      allButtons.forEach((btn, index) => {
        const icon = btn.querySelector('i.material-icons');
        if (icon && icon.textContent.trim() === 'create_new_folder') {
          folderButton = btn;
          console.log(`✓ Found Save to My Jobs Folder button at index ${index}!`);
          
          // Log its location for debugging
          const parent = btn.parentElement;
          console.log(`Button parent class: ${parent?.className}`);
          console.log(`Button classes: ${btn.className}`);
        }
      });
    }
    
    // Also try searching ALL buttons on the page
    if (!folderButton) {
      const allPageButtons = document.querySelectorAll('button');
      console.log(`Searching ${allPageButtons.length} buttons on entire page...`);
      
      for (const btn of allPageButtons) {
        const icon = btn.querySelector('i.material-icons');
        if (icon && icon.textContent.trim() === 'create_new_folder') {
          folderButton = btn;
          console.log('✓ Found folder button in page-wide search!');
          
          // Check if it's visible
          const isVisible = btn.offsetParent !== null;
          console.log(`Button visibility: ${isVisible}`);
          
          if (!isVisible) {
            console.log('Button found but not visible, continuing search...');
            folderButton = null;
          } else {
            break;
          }
        }
      }
    }
    
      if (!folderButton) {
        await new Promise(resolve => setTimeout(resolve, 300));
        buttonSearchAttempts++;
      }
    }
  }
  
  if (!folderButton) {
    console.log('ERROR: Save to My Jobs Folder button not found after extensive search');
    console.log('Attempting to list all visible buttons for debugging:');
    document.querySelectorAll('button').forEach((btn, i) => {
      const icon = btn.querySelector('i.material-icons');
      if (icon) {
        console.log(`Button ${i}: icon="${icon.textContent.trim()}", visible=${btn.offsetParent !== null}`);
      }
    });
    showNotification('Cannot find WaterlooWorks folder button', 'error');
    return;
  }
  
  // Close any existing panels first
  const existingPanel = document.querySelector('.sidebar--action__content, .sidebar--action');
  if (existingPanel) {
    console.log('Closing existing panel first...');
    closeSidePanels();
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Click the button to open side panel
  console.log('Clicking Save to My Jobs Folder button...');
  folderButton.click();
  
  // ULTRA SIMPLE: Just wait for "shortlist" text to appear anywhere
  console.log('Waiting for shortlist option to appear...');
  
  // First, let's see what's in the sidebar immediately
  await new Promise(resolve => setTimeout(resolve, 500));
  const immediateCheck = document.querySelector('.sidebar--action');
  if (immediateCheck) {
    console.log('Immediate sidebar check:');
    console.log(`  - Has content: ${immediateCheck.innerHTML.length > 0}`);
    console.log(`  - HTML length: ${immediateCheck.innerHTML.length}`);
    console.log(`  - Contains "shortlist": ${immediateCheck.innerHTML.toLowerCase().includes('shortlist')}`);
    
    // CRITICAL: Check what job the side panel is showing
    const sidePanelJobTitle = immediateCheck.querySelector('h3')?.textContent?.trim();
    console.log(`  - Side panel shows job: "${sidePanelJobTitle}"`);
    console.log(`  - Modal shows job: "${jobTitle}"`);
    
    if (sidePanelJobTitle && sidePanelJobTitle !== jobTitle) {
      console.error('WARNING: Side panel is showing DIFFERENT job than modal!');
      console.error(`Expected: "${jobTitle}", Got: "${sidePanelJobTitle}"`);
      showNotification('ERROR: WaterlooWorks panel showing wrong job!', 'error');
      closeSidePanels();
      return;  // STOP - don't shortlist wrong job!
    }
  }
  
  const shortlistElement = await waitForElementWithText('shortlist', 8000);
  
  if (!shortlistElement) {
    console.log('ERROR: Shortlist text never appeared in sidebar');
    showNotification('Shortlist option not found - try creating a shortlist folder first', 'error');
    closeSidePanels();
    return;
  }
  
  console.log(`✓ Found shortlist in ${shortlistElement.tagName} element`);
  console.log(`  Element text: "${shortlistElement.textContent.trim()}"`);
  console.log(`  Element HTML: ${shortlistElement.outerHTML.substring(0, 200)}...`);
  
  // Find the checkbox associated with this shortlist element
  let shortlistCheckbox = null;
  
  // Start from the element and work our way up/around to find the checkbox
  let searchElement = shortlistElement;
  let searchAttempts = 0;
  
  while (!shortlistCheckbox && searchAttempts < 5) {
    // Try current element
    shortlistCheckbox = searchElement.querySelector('input[type="checkbox"]');
    
    // Try siblings
    if (!shortlistCheckbox && searchElement.parentElement) {
      shortlistCheckbox = searchElement.parentElement.querySelector('input[type="checkbox"]');
    }
    
    // Move up one level
    searchElement = searchElement.parentElement;
    searchAttempts++;
    
    if (!searchElement) break;
  }
  
  // Final attempt: Find ANY checkbox with ID containing numbers (like "960")
  if (!shortlistCheckbox) {
    console.log('Searching for any checkbox near shortlist text...');
    const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
    
    for (const cb of allCheckboxes) {
      // Check if this checkbox is near the shortlist text
      const label = cb.closest('label');
      if (label && label.textContent.toLowerCase().includes('shortlist')) {
        shortlistCheckbox = cb;
        console.log(`✓ Found shortlist checkbox! ID: ${cb.id}`);
        break;
      }
    }
  }
  
  if (!shortlistCheckbox) {
    console.log('ERROR: Shortlist checkbox not found');
    closeSidePanels();
    showNotification('Failed to find shortlist option', 'error');
    return;
  }
  
  // Toggle the checkbox if needed
  const currentState = shortlistCheckbox.checked;
  const desiredState = !isCurrentlyShortlisted; // We want to toggle to the opposite state
  
  console.log(`Checkbox state: current=${currentState}, desired=${desiredState}`);
  
  if (currentState !== desiredState) {
    console.log('Clicking checkbox to toggle...');
    shortlistCheckbox.click();
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Find and click the Save button
  const saveButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.trim().toLowerCase() === 'save'
  );
  
  if (saveButton) {
    console.log('✓ Clicking Save button...');
    saveButton.click();
    await new Promise(resolve => setTimeout(resolve, 500));
  } else {
    console.log('WARNING: Save button not found');
  }
  
  // Update our tracking
  if (isCurrentlyShortlisted) {
    shortlistedJobs.delete(jobId);
    showNotification('Removed from WaterlooWorks shortlist', 'remove');
  } else {
    shortlistedJobs.add(jobId);
    showNotification('Added to WaterlooWorks shortlist', 'add');
  }
  
  // Save to localStorage
  saveShortlist();
  
  // Update both modal star and table row star
  updateShortlistIndicator();
  updateTableRowStars();
  
  console.log(`✅ Shortlist updated in WaterlooWorks! Total shortlisted: ${shortlistedJobs.size}`);
}

// Update shortlist indicator in modal
function updateShortlistIndicator() {
  const jobId = getCurrentJobId();
  if (!jobId) {
    console.log('Cannot update star - no job ID');
    return;
  }
  
  const isShortlisted = shortlistedJobs.has(jobId);
  console.log(`Updating star for job ${jobId}: ${isShortlisted ? '⭐ SHORTLISTED' : '☆ NOT SHORTLISTED'}`);
  
  // Debug: Show all currently shortlisted jobs
  if (shortlistedJobs.size > 0) {
    console.log(`Currently tracking ${shortlistedJobs.size} shortlisted jobs:`, Array.from(shortlistedJobs));
  }
  
  // Add star to modal header
  const modalContainer = document.querySelector('div[data-v-70e7ded6-s]');
  if (modalContainer) {
    // Remove existing star if any
    const existingStar = modalContainer.querySelector('#ww-shortlist-star');
    if (existingStar) existingStar.remove();
    
    // Find a good place to add the star - try the modal header area
    const modalHeader = modalContainer.querySelector('[role="tabpanel"]');
    if (modalHeader) {
      const starButton = document.createElement('button');
      starButton.id = 'ww-shortlist-star';
      starButton.innerHTML = isShortlisted ? '⭐' : '☆';
      starButton.title = isShortlisted ? 'Remove from shortlist (↑)' : 'Add to shortlist (↑)';
      starButton.style.cssText = `
        position: absolute;
        top: 12px;
        right: 300px;
        background: ${isShortlisted ? 'linear-gradient(135deg, #ffd700, #ffed4e)' : 'white'};
        color: ${isShortlisted ? '#333' : '#999'};
        border: ${isShortlisted ? '2px solid #ffd700' : '2px solid #ddd'};
        border-radius: 50%;
        width: 48px;
        height: 48px;
        font-size: 30px;
        cursor: pointer;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${isShortlisted ? '0 3px 15px rgba(255, 215, 0, 0.4)' : '0 2px 10px rgba(0,0,0,0.15)'};
        transition: all 0.3s ease;
      `;
      
      starButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleShortlist();  // Try WaterlooWorks integration
      });
      
      starButton.addEventListener('mouseenter', () => {
        starButton.style.transform = 'scale(1.15) rotate(10deg)';
        if (shortlistedJobs.has(jobId)) { // Check current state
          starButton.style.boxShadow = '0 5px 20px rgba(255, 215, 0, 0.6)';
        } else {
          starButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.25)';
        }
      });
      
      starButton.addEventListener('mouseleave', () => {
        starButton.style.transform = 'scale(1) rotate(0deg)';
        if (shortlistedJobs.has(jobId)) { // Check current state
          starButton.style.boxShadow = '0 3px 15px rgba(255, 215, 0, 0.4)';
        } else {
          starButton.style.boxShadow = '0 2px 10px rgba(0,0,0,0.15)';
        }
      });
      
      modalHeader.appendChild(starButton);
      console.log('Star button added to modal');
    }
  }
  
  // Remove any existing inline star if it exists (cleanup)
  const existingInlineStar = document.querySelector('#ww-inline-star');
  if (existingInlineStar) existingInlineStar.remove();
}

// Pre-hide modal to prevent FOUC
function preHideModal() {
  const style = document.getElementById('ww-prehide-style');
  if (!style) {
    const hideStyle = document.createElement('style');
    hideStyle.id = 'ww-prehide-style';
    hideStyle.textContent = `
      div[data-v-70e7ded6-s] [role="tabpanel"] {
        opacity: 0 !important;
        transition: opacity 0.2s ease;
      }
      div[data-v-70e7ded6-s] [role="tabpanel"].ww-ready {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(hideStyle);
  }
}

// Clean up any existing enhancements
function cleanupEnhancements() {
  console.log('Cleaning up enhancements...');
  
  document.querySelectorAll('.ww-enhanced-panel').forEach(panel => panel.remove());
  document.querySelectorAll('.ww-field-wrapper').forEach(field => field.remove());
  document.querySelectorAll('.ww-drop-indicator').forEach(indicator => indicator.remove());
  document.querySelectorAll('.ww-drag-ghost').forEach(ghost => ghost.remove());
  document.querySelectorAll('div[id^="panel_"]').forEach(panel => {
    panel.style.display = '';
    panel.style.paddingTop = '';
    panel.style.marginBottom = '';
    panel.style.margin = '';
  });
  
  // Restore all hidden elements
  document.querySelectorAll('[data-ww-hidden="true"]').forEach(element => {
    element.style.display = '';
    delete element.dataset.wwHidden;
  });
  
  // Restore padding on padded containers
  const paddedContainers = document.querySelectorAll('.padding--a--m');
  paddedContainers.forEach(container => {
    container.style.padding = '';
  });
  
  const modalContainer = document.querySelector('div[data-v-70e7ded6-s]');
  if (modalContainer) {
    delete modalContainer.dataset.wwEnhanced;
    
    // Make sure tab panels are visible
    const tabPanel = modalContainer.querySelector('[role="tabpanel"]');
    if (tabPanel) {
      tabPanel.classList.add('ww-ready');
      tabPanel.style.opacity = '';
    }
  }
}

// Create enhanced field wrapper - COMPACT VERSION
function createFieldWrapper(labelText, contentElement, panelTitle, isCompact = false) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ww-field-wrapper';
  wrapper.dataset.fieldName = labelText;
  wrapper.dataset.panelName = panelTitle;
  
  // Check if content is simple (single line text)
  const contentText = contentElement ? contentElement.textContent.trim() : '';
  const hasSelectBox = contentElement && contentElement.querySelector('select');
  const isSimpleField = contentText && 
                        contentText.length < 100 && 
                        !contentText.includes('\n') &&
                        !contentElement.querySelector('ul, ol, table, br') &&
                        !hasSelectBox;
  
  if (hasSelectBox && labelText === 'Level') {
    // SPECIAL LAYOUT only for Level field with select box - no border
    wrapper.style.cssText = `
      margin: 3px 0;
      transition: all 0.3s ease;
      position: relative;
      display: flex;
      align-items: center;
      padding: 4px 0;
      min-height: 36px;
    `;
    
    const dragHandle = document.createElement('span');
    dragHandle.className = 'ww-field-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.style.cssText = `
      margin-right: 10px;
      color: #999;
      font-size: 11px;
      cursor: move;
      padding: 3px;
      user-select: none;
      transition: all 0.2s ease;
    `;
    
    // Create a container for the content to ensure proper containment
    const contentContainer = document.createElement('div');
    contentContainer.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
    `;
    
    if (contentElement) {
      contentContainer.appendChild(contentElement);
    }
    
    wrapper.appendChild(dragHandle);
    wrapper.appendChild(contentContainer);
    
    // Setup drag
    setupFieldDrag(wrapper, dragHandle, panelTitle);
    
  } else if (isSimpleField) {
    // COMPACT INLINE LAYOUT for simple fields
    wrapper.style.cssText = `
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      margin: 3px 0;
      background: white;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      transition: all 0.3s ease;
      position: relative;
      display: flex;
      align-items: center;
      padding: 8px 10px;
      min-height: 36px;
      background: #f8f9fa;
    `;
    
    const dragHandle = document.createElement('span');
    dragHandle.className = 'ww-field-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.style.cssText = `
      margin-right: 10px;
      color: #999;
      font-size: 11px;
      cursor: move;
      padding: 3px;
      user-select: none;
      transition: all 0.2s ease;
    `;
    
    const labelDiv = document.createElement('div');
    labelDiv.textContent = labelText + ':';
    labelDiv.style.cssText = `
      font-weight: 600;
      color: #333;
      font-size: 13px;
      user-select: text;
      margin-right: 10px;
      min-width: fit-content;
    `;
    
    const contentDiv = document.createElement('div');
    contentDiv.style.cssText = `
      flex: 1;
      font-size: 13px;
      color: #212529;
      user-select: text;
      cursor: text;
    `;
    contentDiv.textContent = contentText;
    
    wrapper.appendChild(dragHandle);
    wrapper.appendChild(labelDiv);
    wrapper.appendChild(contentDiv);
    
    // Setup drag
    setupFieldDrag(wrapper, dragHandle, panelTitle);
    
  } else {
    // FULL LAYOUT for complex fields (with collapse button)
    wrapper.style.cssText = `
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      margin: 3px 0;
      background: white;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
      width: 100%;
      box-sizing: border-box;
      display: block;
      clear: both;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 10px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
      cursor: default;
      min-height: 36px;
    `;
    
    const dragHandle = document.createElement('span');
    dragHandle.className = 'ww-field-drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.style.cssText = `
      margin-right: 10px;
      color: #999;
      font-size: 11px;
      cursor: move;
      padding: 3px;
      user-select: none;
      transition: all 0.2s ease;
    `;
    
    const labelDiv = document.createElement('div');
    labelDiv.textContent = labelText;
    labelDiv.style.cssText = `
      flex: 1;
      font-weight: 600;
      color: #333;
      font-size: 13px;
      user-select: text;
    `;
    
    const fieldKey = `${panelTitle}_${labelText}`;
    const collapseBtn = document.createElement('button');
    collapseBtn.innerHTML = collapsedFields[fieldKey] ? '▸' : '▾';
    collapseBtn.style.cssText = `
      background: white;
      border: 1px solid #ddd;
      border-radius: 3px;
      padding: 2px 6px;
      cursor: pointer;
      color: #666;
      font-size: 11px;
      user-select: none;
      transition: all 0.2s ease;
      line-height: 1;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 10px 12px;
      display: ${collapsedFields[fieldKey] ? 'none' : 'block'};
      font-size: 13px;
      color: #212529;
      line-height: 1.5;
      user-select: text;
      cursor: text;
      overflow: hidden;
      word-wrap: break-word;
      width: 100%;
      box-sizing: border-box;
    `;
    
    // Clone the content element
    if (contentElement) {
      const clone = contentElement.cloneNode(true);
      
      // Ensure cloned content is properly contained
      clone.style.cssText = `
        width: 100%;
        box-sizing: border-box;
        max-width: 100%;
        overflow-wrap: break-word;
      `;
      
      // Remove the "View Targeted Degrees and Disciplines" button and show content
      const toggleButton = clone.querySelector('button[onclick*="targetedClusters"]');
      if (toggleButton) {
        toggleButton.style.display = 'none';
        
        // Find and show the hidden content
        const targetedList = clone.querySelector('.targetedClusters');
        if (targetedList) {
          targetedList.style.display = 'block';
        }
      }
      
      // Enable text selection on all content and ensure proper containment
      const allElements = clone.querySelectorAll('*');
      allElements.forEach(el => {
        el.style.userSelect = 'text';
        el.style.cursor = 'text';
        // Ensure child elements don't break out of container
        if (el.style.position === 'absolute' || el.style.position === 'fixed') {
          el.style.position = 'relative';
        }
        if (el.style.width && (el.style.width.includes('100vw') || parseInt(el.style.width) > 1000)) {
          el.style.width = '100%';
          el.style.maxWidth = '100%';
        }
      });
      
      content.appendChild(clone);
    }
    
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = content.style.display === 'none';
      content.style.display = isCollapsed ? 'block' : 'none';
      collapseBtn.innerHTML = isCollapsed ? '▾' : '▸';
      
      if (isCollapsed) {
        delete collapsedFields[fieldKey];
      } else {
        collapsedFields[fieldKey] = true;
      }
      savePreferences();
    });
    
    header.appendChild(dragHandle);
    header.appendChild(labelDiv);
    header.appendChild(collapseBtn);
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    
    // Setup drag on the handle only
    setupFieldDrag(wrapper, dragHandle, panelTitle);
  }
  
  return wrapper;
}

// Create drop indicator
function createDropIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'ww-drop-indicator';
  indicator.style.cssText = `
    height: 3px;
    background: linear-gradient(90deg, transparent, #667eea, transparent);
    margin: 4px 0;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  `;
  return indicator;
}

// Setup drag for individual fields with smooth animations and column support
function setupFieldDrag(fieldElement, dragHandle, panelTitle) {
  let draggedElement = null;
  let ghostElement = null;
  let dropIndicator = null;
  let initialY = 0;
  let initialX = 0;
  
  dragHandle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    draggedElement = fieldElement;
    initialY = e.clientY;
    initialX = e.clientX;
    
    // Create ghost element
    ghostElement = fieldElement.cloneNode(true);
    ghostElement.className = 'ww-drag-ghost';
    ghostElement.style.cssText = fieldElement.style.cssText + `
      position: fixed;
      top: ${fieldElement.getBoundingClientRect().top}px;
      left: ${fieldElement.getBoundingClientRect().left}px;
      width: ${fieldElement.offsetWidth}px;
      opacity: 0.8;
      pointer-events: none;
      z-index: 10000;
      transform: rotate(2deg);
      transition: none;
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(ghostElement);
    
    // Make original element semi-transparent
    fieldElement.style.opacity = '0.3';
    
    // Create drop indicator
    dropIndicator = createDropIndicator();
    
    const onMouseMove = function(e) {
      if (!draggedElement || !ghostElement) return;
      
      // Move ghost element with cursor
      const deltaY = e.clientY - initialY;
      const deltaX = e.clientX - initialX;
      const rect = fieldElement.getBoundingClientRect();
      ghostElement.style.top = `${rect.top + deltaY}px`;
      ghostElement.style.left = `${rect.left + deltaX + 10}px`;
      
      // Find the element we're hovering over
      ghostElement.style.pointerEvents = 'none';
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      ghostElement.style.pointerEvents = '';
      
      if (!elementBelow) return;
      
      // Check if hovering over panel area
      const panelBelow = elementBelow.closest('.ww-enhanced-panel');
      if (panelBelow && panelBelow.querySelector(`[data-panel-title="${panelTitle}"]`)) {
        const columnsWrapper = panelBelow.querySelector('.ww-columns-wrapper');
        const rightColumn = columnsWrapper.querySelector('.ww-column-right');
        const panelRect = columnsWrapper.getBoundingClientRect();
        const isRightHalf = e.clientX > panelRect.left + panelRect.width / 2;
        
        // Show/hide right column based on drag position
        if (isRightHalf && rightColumn) {
          // Show right column preview when dragging to right half
          rightColumn.style.display = 'block';
          rightColumn.classList.add('drag-preview');
          const leftColumn = columnsWrapper.querySelector('.ww-column-left');
          leftColumn.style.flex = '1';
          // Mark dual column as enabled for this panel
          dualColumnEnabled[panelTitle] = true;
          savePreferences();
        } else if (rightColumn && rightColumn.querySelectorAll('.ww-field-wrapper').length === 0) {
          // Hide right column if dragging to left half and column is empty
          rightColumn.style.display = 'none';
          rightColumn.classList.remove('drag-preview');
          // Mark dual column as disabled if empty
          dualColumnEnabled[panelTitle] = false;
          savePreferences();
        }
        
        // Check which column we're over
        const columnBelow = elementBelow.closest('.ww-column-left, .ww-column-right');
        if (columnBelow && columnBelow.dataset.panelTitle === panelTitle) {
          // Hide drop hint if column has content
          const dropHint = columnBelow.querySelector('.ww-drop-hint');
          if (dropHint) {
            const hasFields = columnBelow.querySelectorAll('.ww-field-wrapper').length > 0;
            dropHint.style.display = hasFields ? 'none' : 'block';
          }
          
          // Check for field below
          const droppableBelow = elementBelow.closest('.ww-field-wrapper');
          if (droppableBelow && droppableBelow !== draggedElement) {
            // Only allow reordering within same panel
            if (droppableBelow.dataset.panelName !== panelTitle) {
              dropIndicator.style.opacity = '0';
              return;
            }
            
            // Show drop indicator
            const rect2 = droppableBelow.getBoundingClientRect();
            const midpoint = rect2.top + rect2.height / 2;
            
            dropIndicator.style.opacity = '1';
            if (e.clientY < midpoint) {
              droppableBelow.parentNode.insertBefore(dropIndicator, droppableBelow);
              droppableBelow.parentNode.insertBefore(draggedElement, droppableBelow);
            } else {
              droppableBelow.parentNode.insertBefore(dropIndicator, droppableBelow.nextSibling);
              droppableBelow.parentNode.insertBefore(draggedElement, droppableBelow.nextSibling);
            }
          } else if (!droppableBelow) {
            // If no field below, add to column
            dropIndicator.style.opacity = '0';
            columnBelow.appendChild(draggedElement);
          }
        }
      } else {
        dropIndicator.style.opacity = '0';
      }
    };
    
    const onMouseUp = function() {
      if (draggedElement) {
        // Restore original element
        draggedElement.style.opacity = '';
        
        // Remove ghost and indicator
        if (ghostElement) {
          ghostElement.remove();
          ghostElement = null;
        }
        if (dropIndicator) {
          dropIndicator.remove();
          dropIndicator = null;
        }
        
        // Check all columns and hide/show appropriately
        const panel = draggedElement.closest('.ww-enhanced-panel');
        if (panel) {
          const rightColumn = panel.querySelector('.ww-column-right');
          const rightFields = rightColumn ? rightColumn.querySelectorAll('.ww-field-wrapper').length : 0;
          
          // Update right column visibility based on content and preference
          if (rightColumn) {
            rightColumn.classList.remove('drag-preview'); // Remove preview styling
            // Show right column if it has fields OR if dual column is enabled for this panel
            if (rightFields > 0) {
              rightColumn.style.display = 'block';
              dualColumnEnabled[panelTitle] = true;
              savePreferences();
            } else if (dualColumnEnabled[panelTitle]) {
              rightColumn.style.display = 'block'; // Keep visible if dual column is enabled
            } else {
              rightColumn.style.display = 'none';
            }
            const dropHint = rightColumn.querySelector('.ww-drop-hint');
            if (dropHint) {
              dropHint.style.display = rightFields > 0 ? 'none' : 'block';
            }
          }
        }
        
        // Clean up any other preview states
        document.querySelectorAll('.ww-column-right.drag-preview').forEach(col => {
          col.classList.remove('drag-preview');
        });
        
        // Save the new order and column position
        const parent = draggedElement.parentElement;
        const enhancedPanel = parent.closest('.ww-enhanced-panel');
        
        if (!fieldOrder[panelTitle]) fieldOrder[panelTitle] = {};
        
        // Get all fields in their current positions
        const leftColumn = enhancedPanel.querySelector('.ww-column-left');
        const rightColumn = enhancedPanel.querySelector('.ww-column-right');
        
        const leftFields = Array.from(leftColumn.querySelectorAll('.ww-field-wrapper'))
          .map(f => f.dataset.fieldName);
        const rightFields = Array.from(rightColumn.querySelectorAll('.ww-field-wrapper'))
          .map(f => f.dataset.fieldName);
        
        // Always save as columns format for consistency
        fieldOrder[panelTitle].columns = {
          left: leftFields,
          right: rightFields
        };
        
        console.log(`Saved field order for ${panelTitle}:`, fieldOrder[panelTitle].columns);
        savePreferences();
        
        draggedElement = null;
      }
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  // Add hover effect
  dragHandle.addEventListener('mouseenter', function() {
    dragHandle.style.transform = 'scale(1.1)';
    dragHandle.style.color = '#667eea';
  });
  
  dragHandle.addEventListener('mouseleave', function() {
    dragHandle.style.transform = '';
    dragHandle.style.color = '#999';
  });
}

// Enhance fields in a panel
function enhanceFields(sourceContainer, panelTitle, targetContainer = null) {
  console.log(`  Enhancing fields in ${panelTitle}...`);
  
  const enhancedFields = [];
  const addressFields = {};
  const addressLabels = [
    'Job - Address Line One',
    'Job - Address Line Two', 
    'Job - City',
    'Job - Province/State',
    'Job - Postal/Zip Code',
    'Job - Country'
  ];
  
  // Use targetContainer if provided, otherwise use sourceContainer
  const insertTarget = targetContainer || sourceContainer;
  
  // Find all .tag__key-value-list elements within the source panel
  const keyValueLists = sourceContainer.querySelectorAll('.tag__key-value-list');
  console.log(`    Found ${keyValueLists.length} key-value lists`);
  
  // First pass: collect all fields
  const fieldsToProcess = [];
  keyValueLists.forEach(kvList => {
    // Skip if already hidden
    if (kvList.dataset.wwHidden === 'true') return;
    
    // Get the parent div that contains this key-value list
    const parentDiv = kvList.parentElement;
    if (!parentDiv) return;
    
    // Find the label
    const labelElement = kvList.querySelector('span.label, .label');
    if (!labelElement) {
      console.log('    No label found for field');
      return;
    }
    
    const labelText = labelElement.textContent.trim().replace(':', '');
    if (!labelText) return;
    
    // Check if this is an address field
    if (addressLabels.includes(labelText)) {
      // Collect address field data
      const valueElement = kvList.querySelector('p');
      if (valueElement) {
        addressFields[labelText] = {
          value: valueElement.textContent.trim(),
          parentDiv: parentDiv,
          kvList: kvList
        };
      }
    } else {
      // Regular field - process normally
      fieldsToProcess.push({
        labelText: labelText,
        kvList: kvList,
        parentDiv: parentDiv
      });
    }
  });
  
  // Create consolidated address field if we have address components
  if (Object.keys(addressFields).length > 0) {
    console.log(`    Creating consolidated Job Location field`);
    
    // Build consolidated address content
    const addressContent = document.createElement('div');
    addressContent.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    
    // Create formatted address
    const addressParts = [];
    
    // Add address lines
    if (addressFields['Job - Address Line One']) {
      addressParts.push(addressFields['Job - Address Line One'].value);
    }
    if (addressFields['Job - Address Line Two']) {
      addressParts.push(addressFields['Job - Address Line Two'].value);
    }
    
    // Add city and province (no postal code)
    const cityLine = [];
    if (addressFields['Job - City']) {
      cityLine.push(addressFields['Job - City'].value);
    }
    if (addressFields['Job - Province/State']) {
      cityLine.push(addressFields['Job - Province/State'].value);
    }
    // Skip postal code
    if (cityLine.length > 0) {
      addressParts.push(cityLine.join(', '));
    }
    
    // Add country
    if (addressFields['Job - Country']) {
      addressParts.push(addressFields['Job - Country'].value);
    }
    
    // Create the display with proper address formatting
    addressParts.forEach((part, index) => {
      const line = document.createElement('div');
      line.textContent = part;
      line.style.cssText = `
        color: #212529;
        font-size: 13px;
        line-height: 1.5;
        ${index > 0 ? 'margin-top: 4px;' : ''}
        user-select: text;
        cursor: text;
      `;
      addressContent.appendChild(line);
    });
    
    // Create the consolidated field wrapper
    const wrapper = createFieldWrapper('Job Location', addressContent, panelTitle);
    
    // Hide all original address fields and insert the consolidated one at the first position
    let firstAddressField = null;
    Object.values(addressFields).forEach(field => {
      field.parentDiv.style.cssText = `
        display: none !important;
        position: absolute !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      `;
      field.parentDiv.dataset.wwHidden = 'true';
      if (!firstAddressField) {
        firstAddressField = field.parentDiv;
      }
    });
    
    if (firstAddressField) {
      // Add to target container instead of original location
      insertTarget.appendChild(wrapper);
      enhancedFields.push(wrapper);
    }
  }
  
  // Process non-address fields
  fieldsToProcess.forEach(fieldData => {
    const { labelText, kvList, parentDiv } = fieldData;
    
    console.log(`    Processing field: ${labelText}`);
    
    // Create a content wrapper that will hold ALL content after the label
    const contentWrapper = document.createElement('div');
    
    // Get all content elements (everything that's not the label)
    const labelElement = kvList.querySelector('span.label, .label');
    
    // Use childNodes instead of children to get ALL nodes including text nodes
    const allNodes = Array.from(kvList.childNodes);
    allNodes.forEach(node => {
      // Skip the label element
      if (node === labelElement) return;
      
      // Clone and add all content (elements and text nodes)
      const clone = node.cloneNode(true);
      contentWrapper.appendChild(clone);
    });
    
    // Also check if there's content AFTER the closing tag of kvList but still in parentDiv
    let nextSibling = kvList.nextElementSibling;
    while (nextSibling && parentDiv.contains(nextSibling)) {
      // Clone and add all following content within the parent div
      const clone = nextSibling.cloneNode(true);
      contentWrapper.appendChild(clone);
      nextSibling = nextSibling.nextElementSibling;
    }
    
    // Debug logging for Compensation field
    // if (labelText.includes('Compensation') || labelText.includes('Benefits')) {
    //   console.log('Compensation field - kvList innerHTML:', kvList.innerHTML);
    //   console.log('Compensation field - parentDiv innerHTML:', parentDiv.innerHTML);
    //   console.log('Compensation field - contentWrapper innerHTML:', contentWrapper.innerHTML);
    //   console.log('Compensation field - contentWrapper text:', contentWrapper.textContent);
    // }
    
    // Create the enhanced field wrapper
    const wrapper = createFieldWrapper(labelText, contentWrapper, panelTitle);
    
    // Hide the original field completely and insert the wrapper
    parentDiv.style.cssText = `
      display: none !important;
      position: absolute !important;
      visibility: hidden !important;
      height: 0 !important;
      width: 0 !important;
      overflow: hidden !important;
    `;
    parentDiv.dataset.wwHidden = 'true';
    // Add to target container instead of original location
    insertTarget.appendChild(wrapper);
    enhancedFields.push(wrapper);
  });
  
  // Save initial field order if not already saved
  if (!fieldOrder[panelTitle] && enhancedFields.length > 0) {
    const initialFieldNames = enhancedFields.map(f => f.dataset.fieldName);
    fieldOrder[panelTitle] = {
      columns: {
        left: initialFieldNames,
        right: []
      }
    };
    savePreferences();
    console.log(`    Saved initial field order for ${panelTitle}`);
  }
  
  console.log(`    Enhanced ${enhancedFields.length} fields`);
  return enhancedFields.length;
}

// Special handling for SERVICE TEAM table
function enhanceServiceTeam(sourceContainer, panelTitle, targetContainer = null) {
  console.log(`  Enhancing SERVICE TEAM table...`);
  
  const insertTarget = targetContainer || sourceContainer;
  
  const table = sourceContainer.querySelector('table');
  if (!table) return 0;
  
  const enhancedFields = [];
  const rows = table.querySelectorAll('tbody tr');
  
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      const labelText = cells[0].textContent.trim();
      const contentCell = cells[1];
      
      if (labelText && contentCell) {
        const wrapper = createFieldWrapper(labelText, contentCell, panelTitle);
        row.style.display = 'none';
        row.dataset.wwHidden = 'true';
        // Add to target container instead of original location
        insertTarget.appendChild(wrapper);
        enhancedFields.push(wrapper);
      }
    }
  });
  
  // Hide the table if all rows are hidden
  if (enhancedFields.length > 0) {
    table.style.display = 'none';
    table.dataset.wwHidden = 'true';
  }
  
  return enhancedFields.length;
}

// Setup panel drag with smooth animations
function setupPanelDrag(panelElement, dragHandle) {
  let draggedElement = null;
  let ghostElement = null;
  let dropIndicator = null;
  let initialY = 0;
  let initialX = 0;
  
  dragHandle.addEventListener('mousedown', function(e) {
    e.preventDefault();
    draggedElement = panelElement;
    initialY = e.clientY;
    initialX = e.clientX;
    
    // Create ghost element
    ghostElement = panelElement.cloneNode(true);
    ghostElement.className = 'ww-drag-ghost';
    ghostElement.style.cssText = panelElement.style.cssText + `
      position: fixed;
      top: ${panelElement.getBoundingClientRect().top}px;
      left: ${panelElement.getBoundingClientRect().left}px;
      width: ${panelElement.offsetWidth}px;
      opacity: 0.8;
      pointer-events: none;
      z-index: 10000;
      transform: rotate(1deg);
      transition: none;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(ghostElement);
    
    // Make original element semi-transparent
    panelElement.style.opacity = '0.3';
    
    // Create drop indicator
    dropIndicator = createDropIndicator();
    dropIndicator.style.height = '4px';
    
    const onMouseMove = function(e) {
      if (!draggedElement || !ghostElement) return;
      
      // Move ghost element with cursor
      const deltaY = e.clientY - initialY;
      const deltaX = e.clientX - initialX;
      const rect = panelElement.getBoundingClientRect();
      ghostElement.style.top = `${rect.top + deltaY}px`;
      ghostElement.style.left = `${rect.left + deltaX + 10}px`;
      
      // Find the element we're hovering over
      ghostElement.style.pointerEvents = 'none';
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      ghostElement.style.pointerEvents = '';
      
      if (!elementBelow) return;
      
      const droppableBelow = elementBelow.closest('.ww-enhanced-panel');
      if (!droppableBelow || droppableBelow === draggedElement) {
        dropIndicator.style.opacity = '0';
        return;
      }
      
      // Show drop indicator
      const rect2 = droppableBelow.getBoundingClientRect();
      const midpoint = rect2.top + rect2.height / 2;
      
      dropIndicator.style.opacity = '1';
      if (e.clientY < midpoint) {
        droppableBelow.parentNode.insertBefore(dropIndicator, droppableBelow);
        droppableBelow.parentNode.insertBefore(draggedElement, droppableBelow);
      } else {
        droppableBelow.parentNode.insertBefore(dropIndicator, droppableBelow.nextSibling);
        droppableBelow.parentNode.insertBefore(draggedElement, droppableBelow.nextSibling);
      }
    };
    
    const onMouseUp = function() {
      if (draggedElement) {
        // Restore original element
        draggedElement.style.opacity = '';
        
        // Remove ghost and indicator
        if (ghostElement) {
          ghostElement.remove();
          ghostElement = null;
        }
        if (dropIndicator) {
          dropIndicator.remove();
          dropIndicator = null;
        }
        
        // Save the new order
        const newOrder = Array.from(document.querySelectorAll('.ww-enhanced-panel'))
          .map(p => p.dataset.panelTitle);
        sectionOrder = newOrder;
        savePreferences();
        
        draggedElement = null;
      }
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  
  // Add hover effect
  dragHandle.addEventListener('mouseenter', function() {
    dragHandle.style.transform = 'scale(1.1)';
    dragHandle.style.background = 'rgba(255,255,255,0.2)';
  });
  
  dragHandle.addEventListener('mouseleave', function() {
    dragHandle.style.transform = '';
    dragHandle.style.background = '';
  });
}

// Main enhancement function
function enhanceModal() {
  console.log('Starting modal enhancement v43...');
  
  // CRITICAL: Only enhance OVERVIEW tab to avoid breaking other tabs
  const activeTab = document.querySelector('.nav-tabs .active, [role="tab"][aria-selected="true"]');
  if (activeTab) {
    const tabText = activeTab.textContent.trim().toUpperCase();
    if (!tabText.includes('OVERVIEW')) {
      console.log(`Not on OVERVIEW tab (current: ${tabText}), skipping enhancement`);
      return;
    }
  }
  
  if (isEnhancing) {
    console.log('Already enhancing, skipping');
    return;
  }
  
  cleanupEnhancements();
  
  const modalContainer = document.querySelector('div[data-v-70e7ded6-s]');
  if (!modalContainer) {
    console.log('Modal container not found');
    return;
  }
  
  if (modalContainer.dataset.wwEnhanced === 'true') {
    console.log('Modal already marked as enhanced, checking if re-enhancement needed');
    const existingPanels = modalContainer.querySelectorAll('.ww-enhanced-panel');
    if (existingPanels.length > 0) {
      console.log('Enhanced panels exist, skipping re-enhancement');
      // Still update shortlist indicator
      updateShortlistIndicator();
      return;
    }
  }
  
  isEnhancing = true;
  
  // Remove ALL default padding/margins from the modal container
  const modalContent = modalContainer.querySelector('[role="tabpanel"]');
  if (modalContent) {
    const innerDiv = modalContent.querySelector('.padding--a--m');
    if (innerDiv) {
      console.log('Found padded container, removing padding...');
      innerDiv.style.padding = '4px !important';
      innerDiv.classList.remove('padding--a--m');
    }
  }
  
  // First try to find panels with panel_ IDs
  let panels = Array.from(modalContainer.querySelectorAll('div[id^="panel_"]'));
  console.log(`Found ${panels.length} panels with panel_ IDs`);
  
  // Also look for sections by h4 headers that might not have panel_ IDs
  const allH4s = modalContainer.querySelectorAll('h4');
  console.log(`Found ${allH4s.length} h4 headers total`);
  
  allH4s.forEach(h4 => {
    const headerText = h4.textContent.trim();
    console.log(`Checking h4: "${headerText}"`);
    
    // Skip if this h4 is already in a panel we found
    if (panels.some(p => p.contains(h4))) {
      console.log(`  - Already in a panel, skipping`);
      return;
    }
    
    // Find the parent container of this h4 that contains the section content
    let container = h4.parentElement;
    
    // For "What's in it for you" and similar sections, they might be directly after the h4
    // Check if there's content right after the h4
    let nextSibling = h4.nextElementSibling;
    while (nextSibling && nextSibling.tagName === 'BR') {
      nextSibling = nextSibling.nextElementSibling;
    }
    
    // Also check for text nodes (plain text content)
    let hasTextContent = false;
    let checkNode = h4.nextSibling;
    while (checkNode && checkNode !== h4.parentElement.lastChild) {
      if (checkNode.nodeType === Node.TEXT_NODE && checkNode.textContent.trim()) {
        hasTextContent = true;
        break;
      }
      if (checkNode.nodeType === Node.ELEMENT_NODE && checkNode.textContent.trim()) {
        hasTextContent = true;
        break;
      }
      checkNode = checkNode.nextSibling;
    }
    
    if (hasTextContent || (nextSibling && (nextSibling.tagName === 'P' || nextSibling.tagName === 'UL' || nextSibling.tagName === 'DIV'))) {
      // Create a wrapper div for this section
      const wrapper = document.createElement('div');
      wrapper.className = 'ww-dynamic-section';
      wrapper.dataset.sectionTitle = headerText;
      
      // Insert wrapper after h4
      h4.parentNode.insertBefore(wrapper, h4);
      
      // Move h4 into wrapper
      wrapper.appendChild(h4);
      
      // Move all following content into wrapper until we hit another h4 or panel
      let current = wrapper.nextElementSibling;
      while (current && current.tagName !== 'H4' && !current.id?.startsWith('panel_')) {
        let next = current.nextElementSibling;
        wrapper.appendChild(current);
        current = next;
      }
      
      panels.push(wrapper);
      console.log(`  - Created wrapper for standalone section: "${headerText}"`);
    } else {
      // Try the original approach for nested sections
      while (container && container !== modalContainer) {
        if (container.querySelector('.tag__key-value-list') || 
            container.querySelector('p') || 
            container.querySelector('ul')) {
          panels.push(container);
          console.log(`  - Found container for: "${headerText}"`);
          break;
        }
        container = container.parentElement;
      }
    }
  });
  
  console.log(`Total panels found: ${panels.length}`);
  
  // Remove the special handling for "What's in it for you" - it's embedded in Compensation and Benefits
  // and should be displayed as part of that field's content
  
  // Remove default padding from panels
  panels.forEach(panel => {
    if (panel.id) {
      console.log(`Panel ${panel.id} styles:`, {
        paddingTop: panel.style.paddingTop,
        marginBottom: window.getComputedStyle(panel).marginBottom
      });
    }
    panel.style.paddingTop = '0 !important';
    panel.style.marginBottom = '0 !important';
    panel.style.margin = '0 !important';
  });
  
  const enhancedPanels = [];
  
  panels.forEach(panel => {
    const heading = panel.querySelector('h4');
    if (!heading) return;
    
    const panelTitle = heading.textContent.trim();
    console.log(`Enhancing panel: ${panelTitle}`);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ww-enhanced-panel';
    wrapper.dataset.panelTitle = panelTitle;
    wrapper.style.cssText = `
      border: 1px solid #dee2e6;
      border-radius: 6px;
      margin-bottom: 3px !important;
      margin-top: 0 !important;
      overflow: hidden;
      background: white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      user-select: none;
      transition: all 0.3s ease;
      position: relative;
    `;
    
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      cursor: default;
    `;
    
    const dragHandle = document.createElement('span');
    dragHandle.className = 'ww-panel-drag-handle';
    dragHandle.innerHTML = '☰';
    dragHandle.style.cssText = `
      margin-right: 10px;
      color: white;
      font-size: 14px;
      cursor: move;
      padding: 3px 6px;
      user-select: none;
      transition: all 0.2s ease;
      border-radius: 3px;
    `;
    
    const titleDiv = document.createElement('div');
    titleDiv.textContent = panelTitle;
    titleDiv.style.cssText = `
      flex: 1;
      font-weight: bold;
      color: white;
      font-size: 13px;
      user-select: none;
    `;
    
    const collapseBtn = document.createElement('button');
    collapseBtn.innerHTML = collapsedSections[panelTitle] ? '▸' : '▾';
    collapseBtn.style.cssText = `
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      border-radius: 3px;
      padding: 3px 6px;
      cursor: pointer;
      color: white;
      font-size: 12px;
      user-select: none;
      transition: all 0.2s ease;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
      padding: 4px 8px;
      display: ${collapsedSections[panelTitle] ? 'none' : 'block'};
      transition: all 0.3s ease;
    `;
    
    // Create column layout (starts as single column)
    const columnsWrapper = document.createElement('div');
    columnsWrapper.className = 'ww-columns-wrapper';
    columnsWrapper.dataset.panelTitle = panelTitle;
    columnsWrapper.style.cssText = `
      display: flex;
      gap: 8px;
      width: 100%;
      position: relative;
    `;
    
    const leftColumn = document.createElement('div');
    leftColumn.className = 'ww-column-left';
    leftColumn.dataset.panelTitle = panelTitle;
    leftColumn.style.cssText = `
      flex: 1;
      min-height: 50px;
      position: relative;
      width: 100%;
      overflow: visible;
      box-sizing: border-box;
    `;
    
    // Right column starts hidden - only created when needed
    const rightColumn = document.createElement('div');
    rightColumn.className = 'ww-column-right';
    rightColumn.dataset.panelTitle = panelTitle;
    rightColumn.style.cssText = `
      flex: 1;
      min-width: 200px;
      min-height: 50px;
      border-left: 1px dashed #e0e0e0;
      padding-left: 8px;
      position: relative;
      display: none; /* Hidden by default */
      overflow: visible;
      box-sizing: border-box;
    `;
    
    // Add drop zone indicator for right column
    const dropHint = document.createElement('div');
    dropHint.className = 'ww-drop-hint';
    dropHint.textContent = 'Drop here';
    dropHint.style.cssText = `
      color: #aaa;
      font-size: 12px;
      text-align: center;
      padding: 20px;
    `;
    rightColumn.appendChild(dropHint);
    
    columnsWrapper.appendChild(leftColumn);
    columnsWrapper.appendChild(rightColumn);
    content.appendChild(columnsWrapper);
    
    // Don't clone panel content yet - let enhanceFields handle it
    // This prevents unenhanced content from appearing
    
    // Build enhanced panel
    header.appendChild(dragHandle);
    header.appendChild(titleDiv);
    header.appendChild(collapseBtn);
    wrapper.appendChild(header);
    wrapper.appendChild(content);
    
    panel.style.display = 'none';
    panel.parentNode.insertBefore(wrapper, panel);
    
    // Setup drag for panel
    setupPanelDrag(wrapper, dragHandle);
    
    // Enhance fields after DOM insertion - process the original panel and add to leftColumn
    let fieldCount = 0;
    if (panelTitle.includes('SERVICE TEAM')) {
      fieldCount = enhanceServiceTeam(panel, panelTitle, leftColumn);
    } else {
      fieldCount = enhanceFields(panel, panelTitle, leftColumn);
    }
    console.log(`  Total: ${fieldCount} fields enhanced in ${panelTitle}`);
    
    // Process any remaining content that wasn't in key-value format
    const remainingContent = panel.querySelectorAll('div:not([data-ww-hidden="true"]), p:not([data-ww-hidden="true"])');
    remainingContent.forEach(element => {
      // Skip if already processed or if it's a wrapper element
      if (element.dataset.wwHidden === 'true' || 
          element.closest('[data-ww-hidden="true"]') || 
          element.classList.contains('tag__key-value-list')) {
        return;
      }
      
      // Check if this element has actual content
      const text = element.textContent.trim();
      if (text && text.length > 5) {
        // Create a wrapper for this unstructured content
        const wrapper = createFieldWrapper('Additional Content', element, panelTitle);
        leftColumn.appendChild(wrapper);
        
        // Hide the original
        element.style.cssText = `
          display: none !important;
          position: absolute !important;
          visibility: hidden !important;
        `;
        element.dataset.wwHidden = 'true';
      }
    });
    
    // Apply saved column layout and field order
    if (fieldOrder[panelTitle] && fieldOrder[panelTitle].columns) {
      const { left: leftFieldNames = [], right: rightFieldNames = [] } = fieldOrder[panelTitle].columns;
      
      // Reorder fields in LEFT column based on saved preferences
      leftFieldNames.forEach((fieldName, index) => {
        const field = leftColumn.querySelector(`.ww-field-wrapper[data-field-name="${fieldName}"]`);
        if (field) {
          // Move field to its saved position in left column
          leftColumn.appendChild(field);
        }
      });
      
      // Show right column if there are saved fields for it OR if dual column is enabled
      if (rightFieldNames.length > 0 || dualColumnEnabled[panelTitle]) {
        rightColumn.style.display = 'block';
        
        // Move fields to right column based on saved preferences
        rightFieldNames.forEach((fieldName, index) => {
          const field = leftColumn.querySelector(`.ww-field-wrapper[data-field-name="${fieldName}"]`);
          if (field) {
            rightColumn.appendChild(field);
          }
        });
        
        // Show/hide drop hint based on whether right column has content
        const dropHint = rightColumn.querySelector('.ww-drop-hint');
        if (dropHint) {
          dropHint.style.display = rightFieldNames.length > 0 ? 'none' : 'block';
        }
      }
    } else if (dualColumnEnabled[panelTitle]) {
      // Even if no saved field order, show right column if dual column was enabled
      rightColumn.style.display = 'block';
    } else if (fieldOrder[panelTitle] && Array.isArray(fieldOrder[panelTitle])) {
      // Handle legacy format (single column array of field names)
      const savedFieldNames = fieldOrder[panelTitle];
      savedFieldNames.forEach((fieldName, index) => {
        const field = leftColumn.querySelector(`.ww-field-wrapper[data-field-name="${fieldName}"]`);
        if (field) {
          leftColumn.appendChild(field);
        }
      });
    }
    
    // Update drop hint visibility
    const rightHasFields = rightColumn.querySelectorAll('.ww-field-wrapper').length > 0;
    const hint = rightColumn.querySelector('.ww-drop-hint');
    if (hint) {
      hint.style.display = rightHasFields ? 'none' : 'block';
    }
    
    // Ensure right column is hidden if empty
    if (!rightHasFields) {
      rightColumn.style.display = 'none';
    }
    
    // Panel collapse with animation
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = content.style.display === 'none';
      
      if (isCollapsed) {
        content.style.display = 'block';
        content.style.height = '0';
        content.style.overflow = 'hidden';
        setTimeout(() => {
          content.style.height = content.scrollHeight + 'px';
          setTimeout(() => {
            content.style.height = '';
            content.style.overflow = '';
          }, 300);
        }, 10);
      } else {
        content.style.height = content.scrollHeight + 'px';
        content.style.overflow = 'hidden';
        setTimeout(() => {
          content.style.height = '0';
          setTimeout(() => {
            content.style.display = 'none';
            content.style.height = '';
            content.style.overflow = '';
          }, 300);
        }, 10);
      }
      
      collapseBtn.innerHTML = isCollapsed ? '▾' : '▸';
      
      if (isCollapsed) {
        delete collapsedSections[panelTitle];
      } else {
        collapsedSections[panelTitle] = true;
      }
      savePreferences();
    });
    
    // Add hover effect
    collapseBtn.addEventListener('mouseenter', function() {
      collapseBtn.style.background = 'rgba(255,255,255,0.3)';
    });
    
    collapseBtn.addEventListener('mouseleave', function() {
      collapseBtn.style.background = 'rgba(255,255,255,0.2)';
    });
    
    enhancedPanels.push(wrapper);
  });
  
  // Apply saved panel order
  if (sectionOrder.length > 0 && enhancedPanels.length > 0) {
    const parent = enhancedPanels[0].parentElement;
    const sorted = enhancedPanels.sort((a, b) => {
      const aTitle = a.dataset.panelTitle;
      const bTitle = b.dataset.panelTitle;
      const aIndex = sectionOrder.indexOf(aTitle);
      const bIndex = sectionOrder.indexOf(bTitle);
      
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    sorted.forEach(panel => parent.appendChild(panel));
  }
  
  // Add styles
  if (!document.getElementById('ww-navigator-styles')) {
    const style = document.createElement('style');
    style.id = 'ww-navigator-styles';
    style.textContent = `
      .ww-field-wrapper {
        animation: fadeIn 0.3s ease;
      }
      .ww-enhanced-panel {
        animation: fadeIn 0.3s ease;
        margin-bottom: 3px !important;
      }
      .ww-enhanced-panel + .ww-enhanced-panel {
        margin-top: 0 !important;
      }
      div[id^="panel_"] {
        padding-top: 0 !important;
        margin: 0 !important;
      }
      .panel {
        padding-top: 0 !important;
        margin: 0 !important;
      }
      .ww-field-wrapper p {
        margin: 0 !important;
        padding: 0 !important;
        display: block !important;
        visibility: visible !important;
        user-select: text !important;
        cursor: text !important;
      }
      .ww-field-wrapper ul,
      .ww-field-wrapper ol {
        display: block !important;
        visibility: visible !important;
        user-select: text !important;
      }
      .ww-field-wrapper li {
        display: list-item !important;
        visibility: visible !important;
        user-select: text !important;
        cursor: text !important;
      }
      .ww-field-wrapper strong {
        display: inline !important;
        visibility: visible !important;
        user-select: text !important;
      }
      .ww-field-wrapper * {
        user-select: text !important;
      }
      .ww-field-wrapper:first-child {
        margin-top: 0 !important;
      }
      .ww-field-wrapper:last-child {
        margin-bottom: 0 !important;
      }
      .targetedClusters {
        display: block !important;
        margin-top: 8px !important;
        padding-left: 20px !important;
      }
      button[onclick*="targetedClusters"] {
        display: none !important;
      }
      .ww-column-right .ww-field-wrapper {
        width: 100%;
      }
      .ww-column-left .ww-field-wrapper {
        width: 100%;
      }
      .ww-column-right.drag-preview {
        display: block !important;
        background: rgba(102, 126, 234, 0.05);
        border-left: 2px solid #667eea;
      }
      .ww-drop-hint {
        opacity: 0.7;
      }
      @media (max-width: 768px) {
        .ww-enhanced-panel [style*="display: flex"] {
          flex-direction: column !important;
        }
        .ww-column-right {
          border-left: none !important;
          border-top: 1px dashed #e0e0e0 !important;
          padding-left: 0 !important;
          padding-top: 8px !important;
          margin-top: 8px !important;
        }
      }
      .ww-field-wrapper:hover {
        box-shadow: 0 3px 8px rgba(0,0,0,0.12);
        transform: translateY(-1px);
      }
      .ww-enhanced-panel:hover {
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      }
      .ww-field-drag-handle:hover {
        background: rgba(102, 126, 234, 0.1);
        border-radius: 3px;
      }
      .ww-panel-drag-handle:hover {
        background: rgba(255,255,255,0.2);
      }
      .ww-drop-indicator {
        animation: pulse 0.6s infinite;
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes pulse {
        0%, 100% {
          opacity: 0.6;
        }
        50% {
          opacity: 1;
        }
      }
      .ww-drag-ghost {
        animation: ghostFloat 0.3s ease;
      }
      @keyframes ghostFloat {
        from {
          transform: rotate(0deg) scale(1);
        }
        to {
          transform: rotate(2deg) scale(1.02);
        }
      }
      @keyframes pulseGlow {
        0% {
          box-shadow: 0 2px 10px rgba(255, 215, 0, 0.4);
          transform: scale(1);
        }
        50% {
          box-shadow: 0 2px 20px rgba(255, 215, 0, 0.6);
          transform: scale(1.02);
        }
        100% {
          box-shadow: 0 2px 10px rgba(255, 215, 0, 0.4);
          transform: scale(1);
        }
      }
      @keyframes notificationPulse {
        0% {
          transform: translate(-50%, -50%) scale(0.8);
          opacity: 0;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.05);
        }
        100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  modalContainer.dataset.wwEnhanced = 'true';
  
  // Reveal the enhanced modal
  const tabPanel = modalContainer.querySelector('[role="tabpanel"]');
  if (tabPanel) {
    setTimeout(() => {
      tabPanel.classList.add('ww-ready');
    }, 25);
  }
  
  // Update shortlist indicator
  updateShortlistIndicator();
  
  isEnhancing = false;
  console.log('Enhancement complete!');
}

// Close modal
function closeModal() {
  const closeBtn = document.querySelector('button.close, [aria-label="Close"]');
  if (closeBtn) {
    closeBtn.click();
    // Clear the stored job ID when modal closes
    currentModalJobId = null;
    console.log('Modal closed, cleared job ID');
  }
}

// Open job by index - FIXED to avoid CSP error and FOUC
function openJob(index) {
  if (index < 0 || index >= jobLinks.length) return;
  
  currentJobIndex = index;
  
  // CRITICAL: Get and store the job ID for this job
  const row = jobLinks[index].closest('tr');
  if (row) {
    const jobId = getJobIdFromRow(row);
    if (jobId) {
      currentModalJobId = jobId;
      console.log(`Opening job ${index + 1}/${jobLinks.length}, ID: ${jobId}`);
    } else {
      console.log(`WARNING: Could not get job ID for index ${index}`);
    }
  }
  
  // Pre-hide any future modal to prevent flash
  preHideModal();
  
  if (isModalOpen()) {
    closeModal();
    setTimeout(() => {
      // Simulate click event instead of calling click()
      const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      jobLinks[index].dispatchEvent(event);
      // Enhancement will be triggered by MutationObserver
    }, 300);
  } else {
    // Simulate click event instead of calling click()
    const event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });
    jobLinks[index].dispatchEvent(event);
    // Enhancement will be triggered by MutationObserver
  }
}

// Navigation
function nextJob() {
  getAllJobLinks();
  if (currentJobIndex < jobLinks.length - 1) {
    openJob(currentJobIndex + 1);
  } else {
    openJob(0);
  }
}

function previousJob() {
  getAllJobLinks();
  if (currentJobIndex > 0) {
    openJob(currentJobIndex - 1);
  } else {
    openJob(jobLinks.length - 1);
  }
}

// Close any open side panels
function closeSidePanels() {
  // Try multiple selectors for close buttons
  const closeButtons = [
    'button.js--btn--close-sidebar',
    'button.modal__btn--close-posting',
    'button.modal__btn--close',
    'button[class*="close-sidebar"]',
    'nav.floating--action-bar button i.material-icons:contains("close")'
  ];
  
  for (const selector of closeButtons) {
    try {
      const btn = document.querySelector(selector);
      if (btn) {
        console.log('Found and clicking close button:', selector);
        btn.click();
        return true;
      }
    } catch (e) {
      // Try finding close button by icon
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const icon = btn.querySelector('i.material-icons');
        if (icon && icon.textContent.trim() === 'close') {
          const parent = btn.closest('.sidebar--action__content, [class*="sidebar"]');
          if (parent) {
            console.log('Found close button by icon search');
            btn.click();
            return true;
          }
        }
      }
    }
  }
  
  console.log('No side panel close button found');
  return false;
}

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  // Handle Escape key globally to close side panels
  if (e.key === 'Escape') {
    // Clear modal job ID if modal is open
    if (isModalOpen()) {
      currentModalJobId = null;
      console.log('Escape pressed, cleared modal job ID');
    }
    
    // First try to close any side panels
    const sidePanel = document.querySelector('.sidebar--action__content');
    if (sidePanel) {
      e.preventDefault();
      closeSidePanels();
      return;
    }
    
    // Then try to close modal if no side panel
    if (isModalOpen()) {
      closeModal();
    }
    return;
  }
  
  if (!isModalOpen()) return;
  if (e.target.matches('input, textarea, select')) return;
  
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
    e.preventDefault();
    previousJob();
  } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
    e.preventDefault();
    nextJob();
  } else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') {
    e.preventDefault();
    // Try WaterlooWorks integration
    toggleShortlist();
  } else if (e.key === 'C' && e.ctrlKey && e.shiftKey) {
    // Clear all shortlists (for debugging/resetting)
    if (confirm('Clear all shortlisted jobs? This will reset all stars to empty.')) {
      shortlistedJobs.clear();
      saveShortlist();
      updateShortlistIndicator();
      showNotification('All shortlists cleared', 'remove');
      console.log('Cleared all shortlisted jobs');
    }
  }
}, true);

// Track clicks
document.addEventListener('click', function(e) {
  const link = e.target.closest('a[href="javascript:void(0)"].overflow--ellipsis');
  if (link && jobLinks.includes(link)) {
    currentJobIndex = jobLinks.indexOf(link);
    
    // CRITICAL: Get and store the job ID when clicking a job link
    const row = link.closest('tr');
    if (row) {
      const jobId = getJobIdFromRow(row);
      if (jobId) {
        currentModalJobId = jobId;
        console.log(`Clicked job link, stored ID: ${jobId}`);
      } else {
        console.log('WARNING: Could not get job ID from clicked row');
      }
    }
    
    // Pre-hide modal to prevent flash
    preHideModal();
    // Enhancement will be triggered by MutationObserver
  }
  
  // Check for tab clicks to handle tab switching
  const tab = e.target.closest('[role="tab"], .nav-link');
  if (tab && isModalOpen()) {
    console.log('Tab clicked:', tab.textContent.trim());
    setTimeout(() => {
      const activeTab = document.querySelector('.nav-tabs .active, [role="tab"][aria-selected="true"]');
      if (activeTab) {
        const tabText = activeTab.textContent.trim().toUpperCase();
        if (tabText.includes('OVERVIEW')) {
          console.log('Switched to OVERVIEW tab, enhancing...');
          enhanceModal();
        } else {
          console.log('Switched to non-OVERVIEW tab, cleaning up enhancements...');
          cleanupEnhancements();
        }
        // Always update shortlist indicator regardless of tab
        updateShortlistIndicator();
      }
    }, 100);
  }
}, true);

// Floating button
function createFloatingButton() {
  const existing = document.getElementById('ww-navigator-btn');
  if (existing) existing.remove();
  
  const button = document.createElement('button');
  button.id = 'ww-navigator-btn';
  button.innerHTML = '📋 Open Jobs';
  button.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 200px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    border-radius: 12px;
    padding: 12px 20px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    z-index: 999999;
    transition: all 0.3s ease;
  `;
  
  button.addEventListener('mouseenter', function() {
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
  });
  
  button.addEventListener('mouseleave', function() {
    button.style.transform = '';
    button.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
  });
  
  button.addEventListener('click', function() {
    getAllJobLinks();
    if (jobLinks.length > 0) {
      openJob(0);
    }
  });
  
  document.body.appendChild(button);
}

// Status indicator
function createStatusIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'ww-nav-indicator';
  indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px 14px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000000;
    display: none;
    backdrop-filter: blur(10px);
    animation: slideIn 0.3s ease;
  `;
  document.body.appendChild(indicator);
  
  setInterval(() => {
    if (isModalOpen() && currentJobIndex >= 0) {
      indicator.style.display = 'block';
      indicator.innerHTML = `Job ${currentJobIndex + 1}/${jobLinks.length} | ← → Navigate | ↑ or ⭐ Shortlist`;
    } else {
      indicator.style.display = 'none';
    }
  }, 500);
}

// Setup MutationObserver for instant modal detection
function setupModalObserver() {
  if (modalObserver) return;
  
  modalObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check for removed nodes (modal closed)
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && node.matches && node.matches('div[data-v-70e7ded6-s]')) {
          // Modal was removed
          currentModalJobId = null;
          console.log('Modal removed from DOM, cleared job ID');
        }
      }
      
      // Check for added nodes (modal opened)
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // Check if this is the modal or contains the modal
          const modal = node.matches && node.matches('div[data-v-70e7ded6-s]') ? node : 
                       node.querySelector && node.querySelector('div[data-v-70e7ded6-s]');
          
          if (modal) {
            console.log(`Modal detected via MutationObserver, current job ID: ${currentModalJobId}`);
            
            // IMMEDIATELY update shortlist indicator to prevent FOUC
            updateShortlistIndicator();
            
            // Show modal after star is added
            requestAnimationFrame(() => {
              modal.style.opacity = '1';
              modal.style.visibility = 'visible';
            });
            
            // Only enhance if not already enhanced and on OVERVIEW tab
            if (!modal.dataset.wwEnhanced) {
              setTimeout(() => {
                const tabPanel = modal.querySelector('[role="tabpanel"]');
                if (tabPanel && tabPanel.querySelector('div[id^="panel_"]')) {
                  enhanceModal();
                } else {
                  // If content not ready, wait a bit more
                  setTimeout(enhanceModal, 100);
                }
              }, 25);
            }
          }
        }
      }
    }
  });
  
  modalObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize
function initialize() {
  console.log("Initializing WaterlooWorks Navigator v43...");
  
  // CRITICAL: Inject CSS immediately to prevent FOUC
  injectStarStyles();
  
  loadPreferences();
  
  // Setup instant modal detection
  setupModalObserver();
  preHideModal();
  
  // Give the page a moment to fully load, then add stars
  setTimeout(() => {
    console.log('Attempting to add stars to table rows...');
    getAllJobLinks();
    
    // Watch for table changes after initial load
    setupTableObserver();
    
    // Watch for side panel changes (bulk shortlist operations)
    setupSidePanelObserver();
    
    // Note: We DON'T sync based on folder icons because:
    // - Folder icon just means job is in ANY folder, not specifically shortlist
    // - Jobs can be in multiple folders
    // - Our local state is the source of truth for the shortlist folder
    
    createFloatingButton();
    createStatusIndicator();
    console.log(`✅ Ready! WaterlooWorks shortlist integration active`);
    console.log(`Tracking ${shortlistedJobs.size} shortlisted jobs`);
  }, 500); // Small delay to ensure page is ready
}

// Inject CSS early to prevent layout shift and FOUC
function injectStarStyles() {
  // Check if styles already exist
  if (document.getElementById('ww-star-styles')) {
    console.log('Star styles already injected');
    return;
  }
  
  const style = document.createElement('style');
  style.id = 'ww-star-styles';
  style.textContent = `
    /* Simple absolute positioning for stars */
    .ww-row-star {
      position: absolute !important;
      right: 15px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      font-size: 18px !important;
      cursor: pointer !important;
      color: #333 !important;
      transition: all 0.2s ease !important;
      z-index: 10 !important;
    }
    
    .ww-row-star:hover {
      transform: translateY(-50%) scale(1.3) !important;
      color: #ffd700 !important;
    }
    
    /* Ensure table cells have space for stars */
    td {
      position: relative !important;
      overflow: visible !important;
    }
    
    /* Make sure job title cells have enough padding */
    td:nth-child(2) {
      padding-right: 100px !important;
    }
    
    /* Pre-style modal star button */
    #ww-shortlist-star {
      opacity: 1 !important;
      transition: all 0.3s ease !important;
    }
    
    /* Prevent layout shift in modal */
    div[data-v-70e7ded6-s] {
      min-height: 100px; /* Prevent collapse while loading */
    }
  `;
  
  // Insert at the very beginning of head for earliest application
  const head = document.head || document.getElementsByTagName('head')[0];
  if (head) {
    if (head.firstChild) {
      head.insertBefore(style, head.firstChild);
    } else {
      head.appendChild(style);
    }
    console.log('✅ Star styles injected successfully');
  } else {
    console.error('ERROR: Could not find document head!');
  }
}

// Watch for changes to the job table (pagination, filters, etc.)
function setupTableObserver() {
  // Watch the entire table container for any changes
  const tableContainer = document.querySelector('tbody[data-v-612a1958]') || 
                        document.querySelector('table') ||
                        document.querySelector('[role="table"]');
  
  if (!tableContainer) {
    // Try again quickly
    setTimeout(setupTableObserver, 100);
    return;
  }
  
  const observer = new MutationObserver((mutations) => {
    // IMMEDIATE star addition for any new rows
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            // If it's a row, add star immediately
            if (node.tagName === 'TR') {
              addStarToTableRow(node);
            }
            // If it contains rows, add stars to all of them
            const rows = node.querySelectorAll ? node.querySelectorAll('tr') : [];
            rows.forEach(row => addStarToTableRow(row));
          }
        });
      }
    });
    
    // Also do a full refresh (debounced) to catch any missed rows
    clearTimeout(window.tableUpdateTimeout);
    window.tableUpdateTimeout = setTimeout(() => {
      getAllJobLinks();
      console.log('Table fully refreshed');
    }, 50); // Reduced delay
  });
  
  observer.observe(tableContainer, {
    childList: true,
    subtree: true,
    characterData: false, // Don't care about text changes
    attributes: false // Don't care about attribute changes
  });
  
  console.log('Table observer setup - watching for new rows');
}

// Watch for side panel changes to detect bulk operations
function setupSidePanelObserver() {
  console.log('Setting up side panel observer for bulk operations...');
  
  // Track state for the bulk operation
  let selectedJobsBeforePanel = new Set();
  let shortlistCheckboxState = false;
  
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      // Check for side panel appearing
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) { // Element node
          const panel = node.classList?.contains('sidebar--action') ? node :
                       node.querySelector?.('.sidebar--action');
          
          if (panel) {
            console.log('📂 Bulk actions side panel opened');
            
            // Track which jobs are currently selected
            selectedJobsBeforePanel.clear();
            const checkboxes = document.querySelectorAll('input[name="dataViewerSelection"]:checked');
            checkboxes.forEach(checkbox => {
              const jobId = checkbox.value;
              if (jobId) {
                selectedJobsBeforePanel.add(jobId);
              }
            });
            
            console.log(`Tracking ${selectedJobsBeforePanel.size} selected jobs`);
            
            // Wait for panel to load, then track the Save button
            setTimeout(() => {
              const saveButton = panel.querySelector('button.btn__hero--text') ||
                                panel.querySelector('button.btn--default');
              
              if (saveButton && saveButton.textContent.includes('Save')) {
                saveButton.addEventListener('click', function saveHandler() {
                  // Right before save, capture the shortlist checkbox state
                  const shortlistLabel = Array.from(panel.querySelectorAll('p.label'))
                    .find(p => p.textContent.trim() === 'shortlist');
                  
                  if (shortlistLabel) {
                    const checkbox = shortlistLabel.closest('label')?.querySelector('input[type="checkbox"]');
                    shortlistCheckboxState = checkbox?.checked || false;
                    
                    console.log(`Save clicked - shortlist checkbox is ${shortlistCheckboxState ? 'CHECKED' : 'UNCHECKED'}`);
                    
                    // Update our local state immediately
                    selectedJobsBeforePanel.forEach(jobId => {
                      if (shortlistCheckboxState) {
                        shortlistedJobs.add(jobId);
                        console.log(`✅ Added job ${jobId} to shortlist`);
                      } else {
                        shortlistedJobs.delete(jobId);
                        console.log(`❌ Removed job ${jobId} from shortlist`);
                      }
                    });
                    
                    // Save and update UI
                    saveShortlist();
                    updateTableRowStars();
                    updateShortlistIndicator();
                    console.log(`📋 Updated shortlist: ${shortlistedJobs.size} total jobs`);
                  }
                  
                  // Clean up
                  saveButton.removeEventListener('click', saveHandler);
                });
              }
            }, 500);
          }
        }
      });
    });
  });
  
  // Observe the body for side panel changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  console.log('✅ Side panel observer ready - will track bulk shortlist operations');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

console.log("WaterlooWorks Navigator v43.0 loaded - Complete Content Fix!");