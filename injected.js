console.log("Injected Job Navigator script loaded in page context.");

// Global storage for panel ordering (persisted via localStorage)
window.globalPanelOrder = localStorage.getItem('globalPanelOrder')
  ? JSON.parse(localStorage.getItem('globalPanelOrder'))
  : [];

// Global storage for row ordering per table (persisted via localStorage)
window.globalRowOrder = localStorage.getItem('globalRowOrder')
  ? JSON.parse(localStorage.getItem('globalRowOrder'))
  : {};

// Global storage for favourite states (persisted via localStorage) keyed by postingId.
window.favouriteStates = localStorage.getItem('favouriteStates')
  ? JSON.parse(localStorage.getItem('favouriteStates'))
  : {};

// Global state for collapsed rows (keyed by normalized row label)
var rowCollapsedStates = {};

// Global variables to hold current posting info.
window.currentPostingId = null;
window.currentPostingParams = null;

// Global variable to hold current modal scroll position.
var savedScroll = 0;

// Helper: Apply enhanced styles to buttons.
function applyButtonStyles(btn, options = {}) {
  // Default styles
  btn.style.padding = "10px 15px";
  btn.style.fontSize = "16px";
  btn.style.border = "none";
  btn.style.borderRadius = "5px";
  btn.style.color = "#fff";
  btn.style.cursor = "pointer";
  btn.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
  btn.style.transition = "background-color 0.3s ease, transform 0.1s ease";
  
  // Apply background color (can be overridden via options)
  btn.style.backgroundColor = options.backgroundColor || "#007bff";

  // Hover effect
  btn.addEventListener("mouseenter", () => {
    btn.style.backgroundColor = options.hoverColor || "#0056b3";
    btn.style.transform = "scale(1.02)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.backgroundColor = options.backgroundColor || "#007bff";
    btn.style.transform = "scale(1)";
  });
}

// Helper: Refresh job links from the listing page and attach an "open modal" icon.
function refreshJobLinksAndAttachIcons() {
  let jobLinks = Array.from(document.querySelectorAll('a[class^="np-view-btn-"]'));
  console.log("Refreshed jobLinks:", jobLinks.length);
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
  // Attach an icon to each job title cell.
  let titleCells = Array.from(document.querySelectorAll('td.orgDivTitleMaxWidth.align--middle'));
  titleCells.forEach(cell => {
    if (!cell.querySelector('.open-modal-icon')) {
      let icon = document.createElement('span');
      icon.className = 'open-modal-icon';
      icon.style.cursor = 'pointer';
      icon.style.marginLeft = '5px';
      // Use HTML entity for magnifying glass.
      icon.innerHTML = "&#128269;";
      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        let anchor = cell.querySelector('a');
        if (anchor) {
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
        }
      });
      cell.appendChild(icon);
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

waitForOrbis(() => {
  let jobLinks = refreshJobLinksAndAttachIcons();
  console.log("Initial jobLinks:", jobLinks.length);
  let currentIndex = 0;
  
  // Create modal container (using var so it's hoisted and visible to openModal).
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
    // Keep the modal itself scrollable to fill the screen.
    overflow: 'auto',
    padding: '20px'
  });
  
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

  // -------------------------
  // Create the main top button bar for navigation (without Close button)
  // -------------------------
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
  
  const applyBtn = document.createElement('button');
  applyBtn.innerText = 'Apply';
  applyBtn.style.marginRight = '10px';
  applyButtonStyles(applyBtn);
  
  btnContainer.appendChild(prevBtn);
  btnContainer.appendChild(nextBtn);
  btnContainer.appendChild(applyBtn);
  modalContent.appendChild(btnContainer);

  // -------------------------
  // Create floating action buttons for Shortlist and Close in separate containers
  // -------------------------
  // Floating container for Close button
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

  // Floating container for Shortlist button
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
  
  // Append floating actions to the modal so they remain visible regardless of scroll.
  modal.appendChild(floatingActions);
  modal.appendChild(floatingShortList);

  const detailContainer = document.createElement('div');
  detailContainer.id = 'jobDetailContainer';
  modalContent.appendChild(detailContainer);
  
  document.body.appendChild(modal);
  
  // Expose openModal globally.
  window.openModal = function(startIndex) {
    jobLinks = refreshJobLinksAndAttachIcons();
    currentIndex = startIndex;
    modal.style.display = 'block';
    loadJobPosting(currentIndex, savedScroll);
  }
  
  function processJobHTML(html) {
    // Refresh the latest persisted row order.
    window.globalRowOrder = localStorage.getItem('globalRowOrder')
      ? JSON.parse(localStorage.getItem('globalRowOrder'))
      : {};
      
    let parser = new DOMParser();
    let doc = parser.parseFromString(html, 'text/html');
    
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
    
    let postingDiv = doc.querySelector('#postingDiv');
    if (!postingDiv) {
      let err = document.createElement('div');
      err.innerText = "Job details not found.";
      return err;
    }
    let postingClone = postingDiv.cloneNode(true);
    
    let panels = postingClone.querySelectorAll('.panel.panel-default');
    panels.forEach(panel => {
      let heading = panel.querySelector('.panel-heading');
      if (heading) {
        let panelName = heading.textContent.trim().replace(/\s+/g, ' ').toLowerCase();
        panel.dataset.panelName = panelName;
        if (!heading.querySelector('.panel-drag-handle')) {
          let dragHandle = document.createElement('span');
          dragHandle.className = 'panel-drag-handle';
          dragHandle.style.cursor = 'move';
          dragHandle.style.marginRight = '5px';
          dragHandle.innerHTML = '&#9776;';
          heading.insertBefore(dragHandle, heading.firstChild);
        }
      }
      
      let tables = panel.querySelectorAll('table.table-bordered');
      tables.forEach((table, tableIndex) => {
        let tbody = table.querySelector('tbody');
        if (tbody) {
          let panelName = panel.dataset.panelName || "default";
          let tableKey = panelName + "-table-" + tableIndex;
          
          Array.from(tbody.children).forEach(tr => {
            if (!tr.dataset.rowKey) {
              if (!tr.children[0] || tr.children[0].innerHTML.indexOf('&#9776;') === -1) {
                let handleCell = document.createElement('td');
                handleCell.style.width = '30px';
                handleCell.style.cursor = 'move';
                handleCell.innerHTML = '&#9776;';
                tr.insertBefore(handleCell, tr.firstChild);
              }
              let labelCell = tr.children[1];
              let valueCell = tr.children[2];
              if (labelCell && valueCell) {
                // Only add a collapse toggle if there's no nested table in the value cell.
                if (!valueCell.querySelector('table')) {
                  if (!labelCell.querySelector('span.toggle')) {
                    let toggle = document.createElement('span');
                    toggle.className = 'toggle';
                    toggle.style.cursor = 'pointer';
                    toggle.style.marginRight = '5px';
                    toggle.innerHTML = '&#9660;';
                    labelCell.insertBefore(toggle, labelCell.firstChild);
                  }
                }
                let rowKey = labelCell.textContent.trim().toLowerCase();
                tr.dataset.rowKey = rowKey;
                let toggle = labelCell.querySelector('span.toggle');
                if (toggle && rowCollapsedStates[rowKey]) {
                  valueCell.style.display = 'none';
                  toggle.innerHTML = '&#9658;';
                }
                if (toggle) {
                  toggle.addEventListener('click', function(e) {
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
              }
            }
          });
          
          // Reorder rows based on stored order if it exists.
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
          
          // If jQuery UI Sortable is available, enable table row reordering.
          if (window.jQuery && $.fn.sortable) {
            $(tbody).sortable({
              handle: 'td:first-child',
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
          }
        }
      });
    });
    
    // Reorder panels based on stored order if it exists.
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
      // If we have no stored order, save the current panel order.
      window.globalPanelOrder = Array.from(postingClone.querySelectorAll('.panel.panel-default'))
        .map(p => p.dataset.panelName);
      localStorage.setItem('globalPanelOrder', JSON.stringify(window.globalPanelOrder));
    }
    
    // If jQuery UI Sortable is available, enable panel reordering.
    let panelsContainer = postingClone;
    if (window.jQuery && $.fn.sortable) {
      $(panelsContainer).sortable({
        handle: '.panel-drag-handle',
        axis: 'y',
        update: function() {
          window.globalPanelOrder = $(panelsContainer).children('.panel.panel-default').map(function() {
            return this.dataset.panelName;
          }).get();
          console.log("Updated panel order:", window.globalPanelOrder);
          localStorage.setItem('globalPanelOrder', JSON.stringify(window.globalPanelOrder));
        }
      });
    } else {
      console.log("jQuery UI Sortable not available for panels; reordering disabled.");
    }
    
    // Wrap the processed posting content in a container.
    let container = document.createElement('div');
    container.appendChild(headerSection);
    container.appendChild(postingClone);
    return container;
  }
  
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
    let currentFavState = getFavouriteStateFromListing(window.currentPostingId);
    window.favouriteStates[window.currentPostingId] = currentFavState;
    shortlistBtn.textContent = currentFavState ? "Unshortlist" : "Shortlist";
    
    let actionUrl = window.location.href;
    let formEl = document.createElement('form');
    formEl.action = actionUrl;
    for (let key in params) {
      let input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = params[key];
      formEl.appendChild(input);
    }
    let formData = new FormData(formEl);
    
    fetch(actionUrl, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    })
    .then(response => response.arrayBuffer())
    .then(buffer => {
      let decoder = new TextDecoder('utf-8');
      return decoder.decode(buffer);
    })
    .then(html => {
      let processed = processJobHTML(html);
      detailContainer.innerHTML = "";
      detailContainer.appendChild(processed);
      // Restore the saved scroll position on the modal
      modal.scrollTop = scrollPos;
      console.log("Job details loaded.");
    })
    .catch(err => {
      console.error("Error loading job details:", err);
      detailContainer.innerHTML = "Error loading job details.";
    });
  }
  
  nextBtn.addEventListener('click', () => {
    // Save current scroll position from the entire modal
    savedScroll = modal.scrollTop;
    currentIndex++;
    if (currentIndex >= jobLinks.length) currentIndex = 0;
    loadJobPosting(currentIndex, savedScroll);
  });
  
  prevBtn.addEventListener('click', () => {
    savedScroll = modal.scrollTop;
    currentIndex--;
    if (currentIndex < 0) currentIndex = jobLinks.length - 1;
    loadJobPosting(currentIndex, savedScroll);
  });
  
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  document.addEventListener('keydown', (e) => {
    if (modal.style.display === 'block') {
      // Prevent default behavior for arrow keys so the page behind doesn't scroll.
      if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      let key = e.key.toLowerCase();
      if (key === 'arrowright' || key === 'd') {
        nextBtn.click();
      } else if (key === 'arrowleft' || key === 'a') {
        prevBtn.click();
      } else if (key === 'arrowup' || key === 'w' || key === 'arrowdown' || key === 's') {
        shortlistBtn.click();
      } else if (key === 'q') {
        applyBtn.click();
      } else if (key === 'escape') {
        closeBtn.click();
      }
    }
  });
  
  applyBtn.addEventListener('click', () => {
    let link = jobLinks[currentIndex];
    let params = link.dataset.postingParams ? JSON.parse(link.dataset.postingParams) : null;
    if (params) {
      window.orbisAppSr.buildForm(params, '', '_BLANK').submit();
    }
  });
  
  shortlistBtn.addEventListener('click', () => {
    let params = window.currentPostingParams;
    if (params && window.toggleFavouritePosting) {
      let currentState = window.favouriteStates[window.currentPostingId] || false;
      let newState = !currentState;
      toggleFavouritePosting(shortlistBtn, window.currentPostingId, newState, '', params.sortDirection, '1', 'advanced', '');
      window.favouriteStates[window.currentPostingId] = newState;
      localStorage.setItem('favouriteStates', JSON.stringify(window.favouriteStates));
      shortlistBtn.textContent = newState ? "Unshortlist" : "Shortlist";
    }
  });
  
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
  
  // Optionally, you can create an "Open Job Navigator" button if needed.
  // const openModalBtn = document.createElement('button');
  // openModalBtn.innerText = 'Open Job Navigator';
  // Object.assign(openModalBtn.style, {
  //   position: 'fixed',
  //   bottom: '20px',
  //   right: '20px',
  //   zIndex: '10000'
  // });
  // document.body.appendChild(openModalBtn);
  
  // openModalBtn.addEventListener('click', () => {
  //   openModal(0);
  // });
});
