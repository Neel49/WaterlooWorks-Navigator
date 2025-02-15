
console.log("Injected Combined Job Navigator script loaded in page context.");

/**
 * Global variables and state.
 */
window.globalPanelOrder = localStorage.getItem('globalPanelOrder')
  ? JSON.parse(localStorage.getItem('globalPanelOrder'))
  : [];

window.globalRowOrder = localStorage.getItem('globalRowOrder')
  ? JSON.parse(localStorage.getItem('globalRowOrder'))
  : {};

window.favouriteStates = localStorage.getItem('favouriteStates')
  ? JSON.parse(localStorage.getItem('favouriteStates'))
  : {};


let loadedPostingId = null;

var rowCollapsedStates = {};

window.currentPostingId = null;
window.currentPostingParams = null;
var savedScroll = 0;

/**
 * Helper: Style for buttons
 */
function applyButtonStyles(btn, options = {}) {
  btn.style.padding = "10px 15px";
  btn.style.fontSize = "16px";
  btn.style.border = "none";
  btn.style.borderRadius = "5px";
  btn.style.color = "#fff";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  btn.style.transition = "background-color 0.3s ease, transform 0.1s ease";
  btn.style.backgroundColor = options.backgroundColor || "#007bff";

  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = options.hoverColor || "#0056b3";
    btn.style.transform = "scale(1.02)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = options.backgroundColor || "#007bff";
    btn.style.transform = "scale(1)";
  });
}


function refreshJobLinksAndAttachIcons() {
  let jobLinks = Array.from(document.querySelectorAll('a[class^="np-view-btn-"]'));
  console.log("Refreshed jobLinks:", jobLinks.length);

  // Parse postingParams from each link if not set
  jobLinks.forEach(link => {
    if (!link.dataset.postingParams) {
      let onclick = link.getAttribute('onclick');
      let match = onclick && onclick.match(/orbisAppSr\.buildForm\((\{.+?\}),/);
      if (match && match[1]) {
        try {
          let jsonStr = match[1].replace(/'/g, '"');
          let params = JSON.parse(jsonStr);
          link.dataset.postingParams = JSON.stringify(params);
          console.log("Parsed posting params for link", link, params);
        } catch (e) {
          console.error("Error parsing posting parameters for link:", link, e);
        }
      }
    }
  });

  // Attach a small icon next to each job title cell
  let titleCells = Array.from(document.querySelectorAll('td.orgDivTitleMaxWidth.align--middle'));
  titleCells.forEach(cell => {
    if (!cell.querySelector('.job-title-container')) {
      let anchor = cell.querySelector('a');
      if (!anchor) return; // Skip if no anchor

      // Create a wrapper div for flex alignment
      let wrapper = document.createElement('div');
      wrapper.className = 'job-title-container';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'space-between';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden'; 
      wrapper.style.whiteSpace = 'nowrap';
      wrapper.style.gap = '8px';

      // Create a span to hold the job title text
      let titleSpan = document.createElement('span');
      titleSpan.style.flex = '1';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      titleSpan.appendChild(anchor);

      // Create the magnifying glass icon
      let icon = document.createElement('span');
      icon.className = 'open-modal-icon';
      icon.innerHTML = "&#128269;"; // Magnifying glass
      icon.style.cursor = "pointer";
      icon.style.fontSize = "18px";
      icon.style.flexShrink = "0";

      // Replace cell contents with new structure
      cell.innerHTML = '';
      wrapper.appendChild(titleSpan);
      wrapper.appendChild(icon);
      cell.appendChild(wrapper);

      // Event listener for opening modal
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        let params = anchor.dataset.postingParams ? JSON.parse(anchor.dataset.postingParams) : null;
        if (params && params.postingId) {
          let idx = jobLinks.findIndex(j => {
            let p = j.dataset.postingParams ? JSON.parse(j.dataset.postingParams) : null;
            return p && p.postingId === params.postingId;
          });
          if (idx !== -1) {
            window.openModal(idx);
          }
        }
      });
    }
  });

  return jobLinks;
}


function waitForOrbis(callback) {
  if (window.orbisAppSr && typeof window.orbisAppSr.buildForm === 'function') {
    console.log("orbisAppSr is available in page context.");
    callback();
  } else {
    console.log("Waiting for orbisAppSr in page context...");
    setTimeout(() => waitForOrbis(callback), 100);
  }
}


function fetchJobPostingHTML(params) {
  return new Promise((resolve, reject) => {
    const actionUrl = window.location.href;
    const formEl = document.createElement('form');
    formEl.action = actionUrl;

    for (let key in params) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = params[key];
      formEl.appendChild(input);
    }

    const formData = new FormData(formEl);

    fetch(actionUrl, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    .then(resp => resp.arrayBuffer())
    .then(buffer => {
      // Use Windows-1252 decoder to handle special characters like é.
      const decoder = new TextDecoder('windows-1252');
      const html = decoder.decode(buffer);
      resolve(html);
    })
    .catch(err => {
      console.error("Error fetching job posting HTML:", err);
      resolve(null);
    });
  });
}


function extractDashboardHeader(html) {
  let parser = new DOMParser();
  let doc = parser.parseFromString(html, 'text/html');
  let dashboardHeader = doc.querySelector('.dashboard-header__profile-information');

  if (!dashboardHeader) {
    console.warn("No .dashboard-header__profile-information found in job posting.");
    return null;
  }
  console.log(`Extracted .dashboard-header__profile-information:`, dashboardHeader.outerHTML);
  return dashboardHeader;
}

async function setNextPage() {
  const paginationList = document.querySelector(".orbis-posting-actions .pagination.pagination ul");
  const paginationBtns = paginationList?.querySelectorAll("li");
  if (paginationList) {
    const nextPageBtn = paginationBtns[paginationBtns.length - 2].querySelector("a");
    nextPageBtn.click();
  }
  return new Promise(resolve => setTimeout(resolve, 300));
}

async function setPreviousPage() {
  const paginationList = document.querySelector(".orbis-posting-actions .pagination.pagination ul");
  const paginationBtns = paginationList?.querySelectorAll("li");
  if (paginationList) {
    const prevPageBtn = paginationBtns[1].querySelector("a");
    prevPageBtn.click();
  }
  return new Promise(resolve => setTimeout(resolve, 300));
}

function processJobHTML(html) {
  // Reload rowOrder from localStorage
  window.globalRowOrder = localStorage.getItem('globalRowOrder')
    ? JSON.parse(localStorage.getItem('globalRowOrder'))
    : {};

  let parser = new DOMParser();
  let doc = parser.parseFromString(html, 'text/html');

  // Build a header section from .dashboard-header__profile-information if available
  let headerSection = document.createElement('div');
  headerSection.style.cssText = "color: black !important; background-color: #fff !important; padding: 5px; margin-bottom: 10px;";

  let nameEl = doc.querySelector('.dashboard-header__profile-information h1.dashboard-header__profile-information-name');
  let companyEl = doc.querySelector('.dashboard-header__profile-information h2');
  if (nameEl) {
    headerSection.innerHTML += `<h1 style="font-size:1.5em; margin:0;">${nameEl.textContent.trim()}</h1>`;
  }
  if (companyEl) {
    headerSection.innerHTML += `<h2 style="font-size:1em; margin:0;">${companyEl.textContent.trim()}</h2>`;
  }

  // The main posting content
  let postingDiv = doc.querySelector('#postingDiv');
  if (!postingDiv) {
    let err = document.createElement('div');
    err.innerText = "Job details not found (no #postingDiv).";
    let container = document.createElement('div');
    container.appendChild(headerSection);
    container.appendChild(err);
    return container;
  }

  // Clone the content so I can reorder
  let postingClone = postingDiv.cloneNode(true);


  let panels = postingClone.querySelectorAll('.panel.panel-default');
  panels.forEach(panel => {
    let heading = panel.querySelector('.panel-heading');
    if (heading) {
      let panelName = heading.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
      panel.dataset.panelName = panelName;

      // Insert a panel drag-handle if not present
      if (!heading.querySelector('.panel-drag-handle')) {
        let dragHandle = document.createElement('span');
        dragHandle.className = 'panel-drag-handle';
        dragHandle.style.cursor = 'move';
        dragHandle.style.marginRight = '5px';
        dragHandle.innerHTML = '&#9776;';
        heading.insertBefore(dragHandle, heading.firstChild);
      }
    }

    // For each table in this panel, reorder rows and add collapsible toggles
    let tables = panel.querySelectorAll('table.table-bordered');
    tables.forEach((table, tableIndex) => {
      let tbody = table.querySelector('tbody');
      if (tbody) {
        let tableKey = (panel.dataset.panelName || "default") + "-table-" + tableIndex;

        Array.from(tbody.children).forEach(tr => {
          if (!tr.dataset.rowKey) {
            // Insert drag handle in the first cell if not present
            if (tr.children.length > 0 && !tr.children[0].querySelector('.row-drag-handle')) {
              let handleCell = document.createElement('td');
              handleCell.className = 'row-drag-handle';
              handleCell.style.width = '30px';
              handleCell.style.cursor = 'move';
              handleCell.innerHTML = '&#9776;';

              tr.insertBefore(handleCell, tr.firstChild);
            }

            // Add a toggle to show/hide the "value" cell (if label+value structure)
            let labelCell = tr.children[1];
            let valueCell = tr.children[2];
            if (labelCell && valueCell) {
              let rowKey = labelCell.textContent.trim().toLowerCase();
              tr.dataset.rowKey = rowKey;

              // Insert a small toggle arrow in the label cell if not present
              if (!labelCell.querySelector('span.toggle')) {
                let toggle = document.createElement('span');
                toggle.className = 'toggle';
                toggle.style.cursor = 'pointer';
                toggle.style.marginRight = '5px';
                toggle.innerHTML = '&#9660;';
                labelCell.insertBefore(toggle, labelCell.firstChild);

                // Toggle event
                toggle.addEventListener('click', (e) => {
                  if (valueCell.style.display === 'none') {
                    valueCell.style.display = '';
                    toggle.innerHTML = '&#9660;';
                    rowCollapsedStates[rowKey] = false;
                  } else {
                    valueCell.style.display = 'none';
                    toggle.innerHTML = '&#9658;';
                    rowCollapsedStates[rowKey] = true;
                  }
                  e.stopPropagation();
                });
              }

              // If row was previously collapsed, hide it
              if (rowCollapsedStates[rowKey]) {
                valueCell.style.display = 'none';
                labelCell.querySelector('.toggle').innerHTML = '&#9658;';
              }
            }
          }
        });

        // Reorder rows if I have a stored order for this table
        if (window.globalRowOrder[tableKey]) {
          let storedOrder = window.globalRowOrder[tableKey];
          let rows = Array.from(tbody.children);
          let naturalOrder = rows.map(r => r.dataset.rowKey);

          rows.sort((a, b) => {
            let aKey = a.dataset.rowKey;
            let bKey = b.dataset.rowKey;
            let aIndex = storedOrder.indexOf(aKey);
            let bIndex = storedOrder.indexOf(bKey);
            if (aIndex !== -1 && bIndex !== -1) {
              return aIndex - bIndex;
            } else if (aIndex !== -1) {
              return -1;
            } else if (bIndex !== -1) {
              return 1;
            } else {
              return naturalOrder.indexOf(aKey) - naturalOrder.indexOf(bKey);
            }
          });
          rows.forEach(row => tbody.appendChild(row));
        }

        // If jQuery UI Sortable is available, enable row reordering
        if (window.jQuery && $.fn.sortable) {
          $(tbody).sortable({
            handle: 'td.row-drag-handle',
            axis: 'y',
            helper: function(e, tr) {
              let $originals = tr.children();
              let $helper = tr.clone();
              $helper.children().each(function(index) {
                $(this).width($originals.eq(index).width());
              });
              return $helper;
            },
            update: function(e, ui) {
              let newOrder = $(tbody).children('tr').map(function() {
                return this.dataset.rowKey;
              }).get();
              window.globalRowOrder[tableKey] = newOrder;
              localStorage.setItem('globalRowOrder', JSON.stringify(window.globalRowOrder));
              console.log("Updated row order for", tableKey, newOrder);
            }
          });
        } else {
          console.log("jQuery UI not found, row reordering disabled.");
        }
      }
    });
  });

  // Reorder entire panels based on stored order
  if (window.globalPanelOrder && window.globalPanelOrder.length > 0) {
    let panelsArray = Array.from(postingClone.querySelectorAll('.panel.panel-default'));
    panelsArray.sort((a, b) => {
      let aName = a.dataset.panelName;
      let bName = b.dataset.panelName;
      let aIndex = window.globalPanelOrder.indexOf(aName);
      let bIndex = window.globalPanelOrder.indexOf(bName);

      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    let parent = panelsArray[0].parentElement;
    panelsArray.forEach(panel => parent.appendChild(panel));
  } else {
    // If no stored order yet, save the current panel order
    window.globalPanelOrder = Array.from(postingClone.querySelectorAll('.panel.panel-default'))
      .map(p => p.dataset.panelName);
    localStorage.setItem('globalPanelOrder', JSON.stringify(window.globalPanelOrder));
  }

  // If jQuery UI Sortable is available, enable panel reordering
  if (window.jQuery && $.fn.sortable) {
    $(postingClone).sortable({
      handle: '.panel-drag-handle',
      axis: 'y',
      update: function() {
        window.globalPanelOrder = $(postingClone)
          .children('.panel.panel-default')
          .map(function() {
            return this.dataset.panelName;
          }).get();
        localStorage.setItem('globalPanelOrder', JSON.stringify(window.globalPanelOrder));
        console.log("Updated panel order:", window.globalPanelOrder);
      }
    });
  } else {
    console.log("jQuery UI not found, panel reordering disabled.");
  }

  // Wrap everything in a container
  let container = document.createElement('div');
  container.appendChild(headerSection);
  container.appendChild(postingClone);
  return container;
}

/**
 * Main script entry: wait for orbis, then set up UI
 */
waitForOrbis(() => {
  let jobLinks = refreshJobLinksAndAttachIcons();
  console.log("Initial jobLinks:", jobLinks.length);

  let currentIndex = 0;

  // Create the modal container
  var modal = document.createElement('div');
  modal.id = 'jobModal';
  Object.assign(modal.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.8)',
    zIndex: '9999',
    display: 'none',
    overflow: 'auto',
    padding: '20px'
  });

  // Inner content area
  const modalContent = document.createElement('div');
  Object.assign(modalContent.style, {
    position: 'relative',
    margin: '5% auto',
    width: '80%',
    backgroundColor: '#fff',
    borderRadius: '5px',
    padding: '10px'
  });
  modal.appendChild(modalContent);

  // Top nav bar with [Previous] [Next] [Open posting] [Apply]
  const btnContainer = document.createElement('div');
  btnContainer.style.marginBottom = '10px';
  btnContainer.style.textAlign = 'right';

  const prevBtn = document.createElement('button');
  prevBtn.innerText = 'Previous';
  prevBtn.style.marginRight = '10px';
  applyButtonStyles(prevBtn);

  const nextBtn = document.createElement('button');
  nextBtn.innerText = 'Next';
  nextBtn.style.marginRight = '10px';
  applyButtonStyles(nextBtn);

  const openPostingBtn = document.createElement('button');
  openPostingBtn.innerText = 'Open posting';
  openPostingBtn.style.marginRight = '10px';
  applyButtonStyles(openPostingBtn);

  const applyBtn = document.createElement('button');
  applyBtn.innerText = 'Apply';
  applyBtn.style.marginRight = '10px';
  applyButtonStyles(applyBtn);

  btnContainer.appendChild(prevBtn);
  btnContainer.appendChild(nextBtn);
  btnContainer.appendChild(openPostingBtn);
  btnContainer.appendChild(applyBtn);
  modalContent.appendChild(btnContainer);

  // Floating Close & Shortlist
  const floatingActions = document.createElement('div');
  Object.assign(floatingActions.style, {
    position: 'fixed',
    top: '10px',
    right: '30px',
    zIndex: '10001'
  });
  const closeContainer = document.createElement('div');
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Close';
  applyButtonStyles(closeBtn, { backgroundColor: "#dc3545", hoverColor: "#c82333" });
  closeContainer.appendChild(closeBtn);
  floatingActions.appendChild(closeContainer);

  const floatingShortList = document.createElement('div');
  Object.assign(floatingShortList.style, {
    position: 'fixed',
    top: '60px',
    right: '30px',
    zIndex: '10001'
  });
  const shortlistContainer = document.createElement('div');
  const shortlistBtn = document.createElement('button');
  shortlistBtn.innerText = 'Shortlist';
  applyButtonStyles(shortlistBtn);
  shortlistContainer.appendChild(shortlistBtn);
  floatingShortList.appendChild(shortlistContainer);

  modal.appendChild(floatingActions);
  modal.appendChild(floatingShortList);

  const detailContainer = document.createElement('div');
  detailContainer.id = 'jobDetailContainer';
  modalContent.appendChild(detailContainer);

  document.body.appendChild(modal);

  // Expose openModal globally so I can call window.openModal(index).
  window.openModal = function(startIndex) {
    jobLinks = refreshJobLinksAndAttachIcons();
    currentIndex = startIndex;
    modal.style.display = 'block';
    loadJobPosting(currentIndex, savedScroll);
  };

  /**
   * loadJobPosting: fetch, parse, reorder, display in modal
   */
  function loadJobPosting(index, scrollPos = 0) {
    if (index < 0 || index >= jobLinks.length) return;

    detailContainer.innerHTML = "Loading...";
    let link = jobLinks[index];
    let params = link.dataset.postingParams ? JSON.parse(link.dataset.postingParams) : null;
    if (!params) {
      detailContainer.innerHTML = "No posting parameters found.";
      return;
    }
    console.log("Loading job posting index:", index, params);

    window.currentPostingId = params.postingId;
    window.currentPostingParams = params;

    // Reflect favourite state in the shortlist button
    let currentFavState = getFavouriteStateFromListing(window.currentPostingId);
    window.favouriteStates[window.currentPostingId] = currentFavState;
    shortlistBtn.textContent = currentFavState ? "Unshortlist" : "Shortlist";

    // Actually fetch the job detail HTML
    fetchJobPostingHTML(params).then(html => {
      if (!html) {
        detailContainer.innerHTML = "Error loading job details.";
        return;
      }
      let processed = processJobHTML(html);
      detailContainer.innerHTML = "";
      detailContainer.appendChild(processed);

      modal.scrollTop = scrollPos;
      loadedPostingId = window.currentPostingId;
      console.log("Job details loaded for postingId:", window.currentPostingId);
    });
  }

  /**
   * Button event listeners
   */
  nextBtn.addEventListener('click', () => {
    savedScroll = modal.scrollTop;
    currentIndex++;
    if (currentIndex == jobLinks.length) {
      setNextPage().then(() => {
        jobLinks = refreshJobLinksAndAttachIcons();
        currentIndex = 0;
        loadJobPosting(currentIndex, savedScroll)
      })
    } else loadJobPosting(currentIndex, savedScroll);
  });

  prevBtn.addEventListener('click', () => {
    savedScroll = modal.scrollTop;
    currentIndex--;
    if (currentIndex < 0) {
      setPreviousPage().then(() => {
        jobLinks = refreshJobLinksAndAttachIcons();
        currentIndex = jobLinks.length - 1;
        loadJobPosting(currentIndex, savedScroll);
      })
    } else loadJobPosting(currentIndex, savedScroll);
  });

  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
    refreshJobLinksAndAttachIcons();
  });


  document.addEventListener('keydown', (e) => {
    if (modal.style.display === 'block') {
      // Prevent arrow keys from scrolling the page
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }

      let key = e.key.toLowerCase();
      if (key === 'arrowright' || key === 'd') {
        nextBtn.click();
      } else if (key === 'arrowleft' || key === 'a') {
        prevBtn.click();
      } else if (key === 'arrowup' || key === 'arrowdown' || key === 's') {
        shortlistBtn.click();
      } else if (key === 'w') {
        openPostingBtn.click();
      } else if (key === 'q') {
        applyBtn.click();
      } else if (key === 'escape') {
        closeBtn.click();
      }
    }
  });


  openPostingBtn.addEventListener('click', () => {
    let link = jobLinks[currentIndex];
    let params = link.dataset.postingParams ? JSON.parse(link.dataset.postingParams) : null;
    if (params && window.orbisAppSr) {
      window.orbisAppSr.buildForm(params, '', '_BLANK').submit();
    }
  });

  /**
   * "Apply" button logic - demonstrate background fetch approach
   * (You can adapt to your actual application's forms/IDs.)
   */
  applyBtn.addEventListener('click', async () => {
    let link = jobLinks[currentIndex];
    let params = link.dataset.postingParams ? JSON.parse(link.dataset.postingParams) : null;

    if (!params) {
      console.log("No posting params found for current index. Cannot apply.");
      return;
    }

    console.log(`Fetching job details for postingId: ${params.postingId} before applying...`);
    let html = await fetchJobPostingHTML(params);
    if (!html) {
      console.warn(`Failed to load job posting HTML for postingId: ${params.postingId}`);
      return;
    }

    let dashboardHeader = extractDashboardHeader(html);
    if (!dashboardHeader) {
      console.warn(`No .dashboard-header__profile-information found for postingId: ${params.postingId}`);
      return;
    }

    // Attempt to find #tabMyApplication or #otherApplication forms
    let applicationForm = dashboardHeader.querySelector('#tabMyApplication') || dashboardHeader.querySelector('#otherApplication');
    if (applicationForm) {
      console.log(`Submitting extracted application form for postingId: ${params.postingId}`);
      let newForm = applicationForm.cloneNode(true);
      newForm.target = "_blank"; // Submit in new tab
      document.body.appendChild(newForm);
      newForm.submit();
      document.body.removeChild(newForm);
      return;
    }

    console.warn(`No application form found. Trying to click .applyButton if present.`);
    let applyBtnInPosting = dashboardHeader.querySelector('.applyButton');
    if (applyBtnInPosting) {
      console.log(`Clicking .applyButton for postingId: ${params.postingId}`);
      applyBtnInPosting.removeAttribute('disabled');
      applyBtnInPosting.click();
      return;
    }

    console.warn(`No apply form or button found for postingId: ${params.postingId}. Fallback to opening in new tab.`);
    // Final fallback
    if (window.orbisAppSr) {
      window.orbisAppSr.buildForm(params, '', '_blank').submit();
    } else {
      console.error("orbisAppSr not available, cannot open fallback apply page.");
    }
  });

  /**
   * Shortlist button logic
   */
  shortlistBtn.addEventListener('click', () => {
    let params = window.currentPostingParams;
    if (params && window.toggleFavouritePosting) {
      let currentState = window.favouriteStates[window.currentPostingId] || false;
      let newState = !currentState;
      toggleFavouritePosting(
        shortlistBtn,
        window.currentPostingId,
        newState,
        '',
        params.sortDirection,
        '1',
        'advanced',
        ''
      );
      window.favouriteStates[window.currentPostingId] = newState;
      localStorage.setItem('favouriteStates', JSON.stringify(window.favouriteStates));
      shortlistBtn.textContent = newState ? "Unshortlist" : "Shortlist";
    }
  });

  /**
   * Helper to check if the listing page's favourite link is "Unshortlist"
   */
  function getFavouriteStateFromListing(postingId) {
    let buttons = Array.from(document.querySelectorAll('a.favourite'));
    for (let btn of buttons) {
      let onclick = btn.getAttribute('onclick');
      if (onclick && onclick.indexOf(postingId) !== -1) {
        return btn.textContent.trim().toLowerCase() === "unshortlist";
      }
    }
    return false;
  }


  const openModalBtn = document.createElement('button');
  openModalBtn.innerText = 'Open Job Navigator';
  applyButtonStyles(openModalBtn);
  Object.assign(openModalBtn.style, {
    position: 'fixed',
    bottom: '20px',
    right: '30px',
    zIndex: '10000'
  });
  document.body.appendChild(openModalBtn);

  openModalBtn.addEventListener('click', () => {
    openModal(0);
  });
});
