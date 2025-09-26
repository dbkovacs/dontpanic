/* /www/js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // --- DATA ---
    let binderData = [
        { id: 'tab-1', title: 'Procedures', files: [], color: 1, type: 'tab', displayNumber: 1 },
        { id: 'tab-2', title: 'Checklists', files: [], color: 2, type: 'tab', displayNumber: 2 },
        { id: 'tab-3', title: 'Reference', files: [], color: 3, type: 'tab', displayNumber: 3 },
    ];
    let fileContentCache = {};
    const tabColors = 7;

    // --- PDF VIEWER STATE ---
    let pdfDoc = null;
    let currentPdfUrl = '';
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let pdfSearchTerm = '';
    let pdfSearchMatches = [];
    let currentMatchIndex = 0;
    let pinchZoomInstance = null;
    let basePdfScale = 1;
    let hiResRenderTimer = null;

    // --- INTERACTION STATE ---
    let longPressTimer = null;
    let pressStartElement = null;
    let pressStartCoords = { x: 0, y: 0 };
    const LONG_PRESS_DURATION = 500; // ms
    const DRAG_THRESHOLD = 10; // pixels

    // --- DOM ELEMENTS ---
    const pdfCanvas = document.getElementById('pdf-canvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `js/lib/pdf.worker.min.js`;
    }

    // --- INITIALIZATION ---
    function initializeApp() {
        setBuildTimestamp();
        renderBinder(binderData);
        initializeEventListeners();
        binderData.forEach(item => {
            if (item.type === 'tab') {
                item.files.forEach(file => cacheFileContent(file.path));
            }
        });
        updateActiveHeaderColor();
    }

    // --- PDF & CACHING ---
    async function getFileContent(filePath) {
        if (fileContentCache[filePath]) {
            return fileContentCache[filePath].fullText;
        }
        const cache = await cacheFileContent(filePath);
        return cache.fullText;
    }

    async function cacheFileContent(filePath) {
        try {
            const pdf = await pdfjsLib.getDocument(filePath).promise;
            const pageTexts = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                pageTexts.push(textContent.items.map(item => item.str).join(''));
            }
            const fullText = pageTexts.join('\n');
            fileContentCache[filePath] = { fullText, pageTexts };
            return fileContentCache[filePath];
        } catch (error) {
            console.error(`Failed to load or parse ${filePath}:`, error);
            const emptyCache = { fullText: '', pageTexts: [] };
            fileContentCache[filePath] = emptyCache;
            return emptyCache;
        }
    }

    // --- UI RENDERING ---
    function renderBinder(data) {
        const sidebarContent = document.querySelector('.sidebar-content');
        const contentArea = document.querySelector('.content-area');
        if (!sidebarContent || !contentArea) return;
        let sidebarHTML = '';
        let contentHTML = '';
        let firstTabId = null;

        data.forEach((item) => {
            if (item.type === 'tab') {
                if (!firstTabId) firstTabId = item.id;
                sidebarHTML += `
                    <div class="tab-header" draggable="false" data-item-id="${item.id}">
                        <a href="#" class="tab" data-tab-target="#${item.id}-content" data-tab-id="${item.id}" data-color="${item.color}">${item.title} [${item.displayNumber}]</a>
                    </div>`;
                
                let fileListHTML = '<p>No files in this section.</p>';
                if (item.files.length > 0) {
                    fileListHTML = item.files.map(file => `
                        <div class="file-item">
                            <div class="file-item-content" data-path="${file.path}" data-name="${file.name}">
                                <span class="file-name">${file.name}</span>
                                <span class="file-meta">Version: ${file.version} | Updated: ${file.date}</span>
                            </div>
                            <button class="delete-btn" data-tab-id="${item.id}" data-file-name="${file.name}">&times;</button>
                        </div>
                    `).join('');
                }
                contentHTML += `
                    <div class="content-panel" id="${item.id}-content">
                        <div class="content-panel-header"><h2>${item.title} [${item.displayNumber}]</h2></div>
                        <div class="file-list">${fileListHTML}</div>
                    </div>`;
            } else if (item.type === 'section') {
                sidebarHTML += `<div class="sidebar-section" draggable="false" data-item-id="${item.id}">${item.title}</div>`;
            }
        });
        sidebarContent.innerHTML = sidebarHTML;
        contentArea.innerHTML = contentHTML;

        const activeTab = document.querySelector('.tab.active');
        if (!activeTab && firstTabId) {
            document.querySelector(`.tab[data-tab-id="${firstTabId}"]`).classList.add('active');
            document.getElementById(`${firstTabId}-content`).classList.add('active');
        } else if (activeTab) {
            const stillExists = data.some(item => item.id === activeTab.dataset.tabId);
            if (stillExists) {
                document.getElementById(`${activeTab.dataset.tabId}-content`).classList.add('active');
            }
        }
    }

    function renderSearchResults(results, searchTerm) {
        const sidebarContent = document.querySelector('.sidebar-content');
        const contentArea = document.querySelector('.content-area');
        sidebarContent.innerHTML = '<p style="padding: 1rem;">Search Results</p>';
        if (!results.fileNameMatches.length && !results.contentMatches.length) {
            contentArea.innerHTML = '<p style="padding: 1rem;">No results found.</p>';
            return;
        }
        let contentHTML = '<div class="search-results-container">';
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        if (results.fileNameMatches.length) {
            contentHTML += '<h3>Matching Files</h3><div class="file-list">';
            contentHTML += results.fileNameMatches.map(file => {
                const highlightedName = file.name.replace(regex, `<mark>$1</mark>`);
                return `<div class="file-item"><div class="file-item-content" data-path="${file.path}" data-name="${file.name}"><span class="file-name">${highlightedName}</span><span class="file-meta">Version: ${file.version} | Updated: ${file.date}</span></div></div>`;
            }).join('');
            contentHTML += '</div>';
        }
        if (results.contentMatches.length) {
            contentHTML += '<h3>Content Mentions</h3><div class="file-list">';
            contentHTML += results.contentMatches.map(match => {
                const snippet = match.snippet.replace(regex, `<mark>$1</mark>`);
                const highlightedName = match.file.name.replace(regex, `<mark>$1</mark>`);
                return `<div class="file-item content-mention"><div class="file-item-content" data-path="${match.file.path}" data-name="${match.file.name}"><span class="file-name">${highlightedName}</span><span class="file-meta">Found in: ${match.tabTitle}</span><div class="content-mention-snippet">${snippet}</div></div></div>`;
            }).join('');
            contentHTML += '</div>';
        }
        contentHTML += '</div>';
        contentArea.innerHTML = contentHTML;
    }

    // --- EVENT LISTENERS & HANDLERS ---
    function initializeEventListeners() {
        const sidebarContent = document.querySelector('.sidebar-content');
        sidebarContent.addEventListener('mousedown', handlePressStart);
        sidebarContent.addEventListener('touchstart', handlePressStart, { passive: true });
        
        sidebarContent.addEventListener('dragstart', handleDragStart);
        sidebarContent.addEventListener('dragend', handleDragEnd);
        sidebarContent.addEventListener('dragover', handleDragOver);
        sidebarContent.addEventListener('drop', handleDrop);
        
        menuToggleBtn.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', toggleSidebar);

        document.getElementById('add-tab-btn').addEventListener('click', addTab);
        document.getElementById('add-section-btn').addEventListener('click', addSection);
        document.querySelector('.content-area').addEventListener('click', handleContentAreaClick);
        document.getElementById('search-input').addEventListener('input', handleSearch);
        document.getElementById('import-files-btn').addEventListener('click', () => document.getElementById('file-importer').click());
        document.getElementById('file-importer').addEventListener('change', handleFileImport);
        
        document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', (e) => closeModal(e.target.dataset.modalId)));
        
        document.getElementById('prev-page-btn').addEventListener('click', onPrevPage);
        document.getElementById('next-page-btn').addEventListener('click', onNextPage);
        document.getElementById('pdf-search-input').addEventListener('input', handlePdfSearch);
        document.getElementById('pdf-search-prev').addEventListener('click', goToPrevMatch);
        document.getElementById('pdf-search-next').addEventListener('click', goToNextMatch);

        document.getElementById('edit-tab-cancel').addEventListener('click', () => closeModal('edit-tab-modal'));
        document.getElementById('edit-tab-save').addEventListener('click', saveTabChanges);
        document.getElementById('edit-tab-color-palette').addEventListener('click', selectColorSwatch);

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (pdfDoc && !document.getElementById('pdf-modal').classList.contains('hidden')) {
                    renderPage(pageNum);
                }
            }, 250);
        });
    }

    function handlePressStart(e) {
        pressStartElement = e.target.closest('.tab-header, .sidebar-section');
        if (!pressStartElement) return;

        pressStartCoords.x = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        pressStartCoords.y = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        longPressTimer = setTimeout(() => {
            const itemId = pressStartElement.dataset.itemId;
            const item = binderData.find(i => i.id === itemId);
            if (item.type === 'tab') {
                openEditModal(itemId);
            } else if (item.type === 'section') {
                editSectionName(itemId);
            }
            clearPressEvents();
        }, LONG_PRESS_DURATION);

        window.addEventListener('mousemove', handlePressMove);
        window.addEventListener('touchmove', handlePressMove);
        window.addEventListener('mouseup', handlePressEnd);
        window.addEventListener('touchend', handlePressEnd);
    }

    function handlePressMove(e) {
        if (!longPressTimer) return;

        const currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const currentY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;
        const deltaX = Math.abs(currentX - pressStartCoords.x);
        const deltaY = Math.abs(currentY - pressStartCoords.y);

        if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
            if (pressStartElement) {
                pressStartElement.draggable = true;
            }
            clearPressEvents(true); // Clear listeners but preserve element for drag
        }
    }

    function handlePressEnd(e) {
        if (longPressTimer) { // If timer still exists, it was a short click
            const target = e.target.closest('.tab');
            if (target) {
                handleTabClick(e);
            }
        }
        clearPressEvents();
    }

    function clearPressEvents(isDragging = false) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        if (!isDragging && pressStartElement) {
            pressStartElement.draggable = false;
            pressStartElement = null;
        }
        window.removeEventListener('mousemove', handlePressMove);
        window.removeEventListener('touchmove', handlePressMove);
        window.removeEventListener('mouseup', handlePressEnd);
        window.removeEventListener('touchend', handlePressEnd);
    }

    function toggleSidebar() {
        sidebar.classList.toggle('is-open');
        sidebarOverlay.classList.toggle('hidden');
    }
    
    function updateActiveHeaderColor() {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;
        const activeColorVar = `--tab-color-${activeTab.dataset.color}`;
        const activeColor = getComputedStyle(document.documentElement).getPropertyValue(activeColorVar);
        const activePanelId = activeTab.dataset.tabTarget;
        const activeHeader = document.querySelector(`${activePanelId} .content-panel-header h2`);
        if (activeHeader) {
            activeHeader.style.color = activeColor;
        }
    }

    function handleTabClick(e) {
        e.preventDefault();
        const clickedTab = e.target.closest('.tab');
        if (!clickedTab) return;

        const searchInput = document.getElementById('search-input');
        if (searchInput.value) {
            searchInput.value = '';
            renderBinder(binderData);
            setTimeout(() => {
                const clickedTabAgain = document.querySelector(`[data-tab-id="${clickedTab.dataset.tabId}"]`);
                if (clickedTabAgain) clickedTabAgain.click();
            }, 0);
            return;
        }
        
        document.querySelectorAll('.sidebar .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
        clickedTab.classList.add('active');
        const targetPanel = document.querySelector(clickedTab.dataset.tabTarget);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
        updateActiveHeaderColor();

        if (sidebar.classList.contains('is-open')) {
            toggleSidebar();
        }
    }
    
    function handleContentAreaClick(e) {
        if (e.target.matches('.delete-btn')) {
            deleteFile(e.target.dataset.tabId, e.target.dataset.fileName);
            return;
        }
        const fileItemContent = e.target.closest('.file-item-content');
        if (fileItemContent) {
            openPdfModal(fileItemContent.dataset.path, fileItemContent.dataset.name);
        }
    }
    
    async function handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase().trim();
        if (!searchTerm) {
            renderBinder(binderData);
            setTimeout(updateActiveHeaderColor, 0);
            return;
        }
        let results = { fileNameMatches: [], contentMatches: [] };
        const addedFileNames = new Set();
        for (const tab of binderData.filter(i => i.type === 'tab')) {
            for (const file of tab.files) {
                if (file.name.toLowerCase().includes(searchTerm) && !addedFileNames.has(file.name)) {
                    results.fileNameMatches.push(file);
                    addedFileNames.add(file.name);
                }
                const content = await getFileContent(file.path);
                const lowerCaseContent = content.toLowerCase();
                let index = lowerCaseContent.indexOf(searchTerm);
                if (index !== -1) {
                    const start = Math.max(0, index - 50);
                    const end = Math.min(content.length, index + searchTerm.length + 50);
                    const snippet = content.substring(start, end);
                    results.contentMatches.push({ file, tabTitle: tab.title, snippet: `...${snippet}...` });
                }
            }
        }
        renderSearchResults(results, searchTerm);
    }

    async function handleFileImport(e) {
        const files = e.target.files;
        if (!files.length) return;
        for (const file of files) {
            if (binderData.some(t => t.type === 'tab' && t.files.some(f => f.name === file.name))) {
                alert(`Duplicate file detected. Skipping: ${file.name}`);
                continue;
            }
            const parts = file.name.replace('.pdf', '').split('-');
            if (parts.length < 2) {
                alert(`Skipping invalid file name: ${file.name}`);
                continue;
            }
            const tabNumber = parseInt(parts[0], 10);
            const targetTab = binderData.find(item => item.type === 'tab' && item.displayNumber === tabNumber);

            if (isNaN(tabNumber) || !targetTab) {
                alert(`Skipping file with invalid tab number in name: ${file.name}`);
                continue;
            }
            const newFile = {
                name: file.name,
                version: 'v1.0',
                date: parts.slice(1).join('-'),
                path: URL.createObjectURL(file)
            };
            targetTab.files.push(newFile);
            await cacheFileContent(newFile.path);
        }
        renderBinder(binderData);
        updateActiveHeaderColor();
        e.target.value = '';
    }

    function deleteFile(tabId, fileName) {
        if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;
        const tab = binderData.find(t => t.id === tabId);
        if (!tab) return;
        const fileIndex = tab.files.findIndex(f => f.name === fileName);
        if (fileIndex > -1) {
            const filePath = tab.files[fileIndex].path;
            URL.revokeObjectURL(filePath);
            delete fileContentCache[filePath];
            tab.files.splice(fileIndex, 1);
        }
        renderBinder(binderData);
        updateActiveHeaderColor();
    }

    function addTab() {
        const title = prompt("Enter a title for the new tab:");
        if (title) {
            const existingTabNumbers = binderData.filter(i => i.type === 'tab').map(t => t.displayNumber);
            const nextNumber = existingTabNumbers.length > 0 ? Math.max(...existingTabNumbers) + 1 : 1;
            const newTab = {
                id: `tab-${Date.now()}`,
                title: title,
                files: [],
                type: 'tab',
                displayNumber: nextNumber,
                color: (binderData.filter(i => i.type === 'tab').length % tabColors) + 1
            };
            binderData.push(newTab);
            renderBinder(binderData);
            updateActiveHeaderColor();
        }
    }

    function addSection() {
        const title = prompt("Enter a title for the new section:");
        if (title) {
            const newSection = {
                id: `section-${Date.now()}`,
                title: title,
                type: 'section'
            };
            binderData.push(newSection);
            renderBinder(binderData);
            updateActiveHeaderColor();
        }
    }
    
    function editSectionName(sectionId) {
        const section = binderData.find(item => item.id === sectionId);
        if (!section) return;
        const newTitle = prompt("Enter the new section name:", section.title);
        if (newTitle && newTitle.trim() !== "") {
            section.title = newTitle.trim();
            renderBinder(binderData);
            updateActiveHeaderColor();
        }
    }

    // --- DRAG AND DROP ---
    let draggedElement = null;
    let draggedId = null;

    function handleDragStart(e) {
        clearPressEvents();
        
        const draggable = e.target.closest('.tab-header, .sidebar-section');
        if (draggable) {
            draggedElement = draggable;
            draggedId = draggable.dataset.itemId;
            setTimeout(() => draggable.classList.add('dragging'), 0);
        }
    }

    function handleDragEnd(e) {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement.draggable = false;
        }
        draggedElement = null;
        draggedId = null;
        pressStartElement = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }

    function handleDragOver(e) {
        e.preventDefault();
        const afterElement = getDragAfterElement(e.currentTarget, e.clientY);
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        if (afterElement) afterElement.classList.add('drag-over');
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.tab-header:not(.dragging), .sidebar-section:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
    function handleDrop(e) {
        e.preventDefault();
        if (!draggedId) return;
        const afterElement = getDragAfterElement(e.currentTarget, e.clientY);
        const draggedIndex = binderData.findIndex(item => item.id === draggedId);
        if (draggedIndex === -1) return;
        const [draggedItem] = binderData.splice(draggedIndex, 1);
        let newIndex;
        if (afterElement) {
            newIndex = binderData.findIndex(item => item.id === afterElement.dataset.itemId);
        } else {
            newIndex = binderData.length;
        }
        binderData.splice(newIndex, 0, draggedItem);
        const activeTabId = document.querySelector('.tab.active')?.dataset.tabId;
        renderBinder(binderData);
        if (activeTabId) {
            const newActiveTab = document.querySelector(`.tab[data-tab-id="${activeTabId}"]`);
            if (newActiveTab) {
                newActiveTab.classList.add('active');
                document.querySelector(newActiveTab.dataset.tabTarget)?.classList.add('active');
            }
        }
        updateActiveHeaderColor();
    }
    
    // --- MODAL & PDF VIEWER ---
    function closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        if (modalId === 'pdf-modal') {
            clearTimeout(hiResRenderTimer);
            if (pinchZoomInstance) {
                pinchZoomInstance.destroy();
                pinchZoomInstance = null;
            }
            pdfDoc = null;
            currentPdfUrl = '';
            pdfSearchTerm = '';
            pdfSearchMatches = [];
            document.getElementById('pdf-search-input').value = '';
            pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        }
    }

    function openPdfModal(pdfUrl, fileName) {
        document.getElementById('pdf-title').textContent = fileName;
        document.getElementById('pdf-modal').classList.remove('hidden');
        currentPdfUrl = pdfUrl;
        
        pdfjsLib.getDocument(pdfUrl).promise.then(async (doc) => {
            pdfDoc = doc;
            document.getElementById('page-count').textContent = pdfDoc.numPages;
            pageNum = 1;

            // Calculate the base scale to fit the page width in the container
            const page = await pdfDoc.getPage(1);
            const container = document.getElementById('pdf-viewer-container');
            const viewport = page.getViewport({ scale: 1 });
            basePdfScale = container.clientWidth / viewport.width;

            renderPage(pageNum);
        }).catch(err => {
            console.error('Error opening PDF:', err);
            alert(`Could not open PDF. The file may be corrupt or an invalid format.`);
        });
    }

    // --- EDIT TAB MODAL ---
    function openEditModal(tabId) {
        const tabData = binderData.find(t => t.id === tabId);
        if (!tabData) return;

        document.getElementById('edit-tab-id').value = tabId;
        document.getElementById('edit-tab-name').value = tabData.title;

        const palette = document.getElementById('edit-tab-color-palette');
        palette.innerHTML = '';
        for (let i = 1; i <= tabColors; i++) {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = `var(--tab-color-${i})`;
            swatch.dataset.color = i;
            if (i === tabData.color) {
                swatch.classList.add('selected');
            }
            palette.appendChild(swatch);
        }
        
        document.getElementById('edit-tab-modal').classList.remove('hidden');
    }

    function selectColorSwatch(e) {
        if (e.target.classList.contains('color-swatch')) {
            document.querySelectorAll('#edit-tab-color-palette .color-swatch').forEach(s => s.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    }

    function saveTabChanges() {
        const tabId = document.getElementById('edit-tab-id').value;
        const newTitle = document.getElementById('edit-tab-name').value.trim();
        const selectedColorSwatch = document.querySelector('#edit-tab-color-palette .color-swatch.selected');
        
        const tabData = binderData.find(t => t.id === tabId);
        if (!tabData) return;

        if (newTitle) {
            tabData.title = newTitle;
        }

        if (selectedColorSwatch) {
            tabData.color = parseInt(selectedColorSwatch.dataset.color, 10);
        }
        
        const activeTabId = document.querySelector('.tab.active')?.dataset.tabId;
        renderBinder(binderData);
        if (activeTabId) {
            const newActiveTab = document.querySelector(`.tab[data-tab-id="${activeTabId}"]`);
            if (newActiveTab) {
                 newActiveTab.classList.add('active');
                 document.querySelector(newActiveTab.dataset.tabTarget)?.classList.add('active');
            }
        }
        updateActiveHeaderColor();
        closeModal('edit-tab-modal');
    }

    // --- PDF RENDERING & SEARCH ---
    function renderHiResPage() {
        if (!pinchZoomInstance || !pdfDoc || pageRendering) return;
        const currentZoom = pinchZoomInstance.zoomFactor;
        if (currentZoom <= 1) return; // Only re-render when zooming in

        // Store state BEFORE re-rendering
        const currentOffset = { ...pinchZoomInstance.offset };
        const parentRect = pinchZoomInstance.el.parentElement.getBoundingClientRect();
        const viewportCenter = { x: parentRect.width / 2, y: parentRect.height / 2 };

        // Calculate which point on the UN-SCALED canvas is at the viewport center.
        const pointX = (viewportCenter.x - currentOffset.x) / currentZoom;
        const pointY = (viewportCenter.y - currentOffset.y) / currentZoom;

        // Update the base scale to bake in the current zoom.
        basePdfScale *= currentZoom;

        // Re-render the page. This will destroy and recreate the pinch zoom instance.
        renderPage(pageNum).then(() => {
            if (pinchZoomInstance) {
                // The new pinchZoomInstance has scale=1 and offset={0,0}.
                // The point we want at the center is now at (pointX, pointY) in the new canvas's coordinates.
                // We need to translate the canvas so this point moves to the viewport center.
                const newOffsetX = viewportCenter.x - pointX;
                const newOffsetY = viewportCenter.y - pointY;
                pinchZoomInstance.setOffset({ x: newOffsetX, y: newOffsetY });
            }
        });
    }

    function renderPage(num, highlightMatchInPage = null) {
        pageRendering = true;
        return pdfDoc.getPage(num).then(page => {
            const zoomContent = document.getElementById('pdf-zoom-content');
            
            const viewport = page.getViewport({ scale: basePdfScale });
            
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            zoomContent.style.width = viewport.width + 'px';
            zoomContent.style.height = viewport.height + 'px';

            const renderContext = { canvasContext: pdfCtx, viewport: viewport };
            return page.render(renderContext).promise.then(() => {
                pageRendering = false;
                if (pageNumPending !== null) {
                    renderPage(pageNumPending.num, pageNumPending.highlight);
                    pageNumPending = null;
                }

                if (pinchZoomInstance) {
                    pinchZoomInstance.destroy();
                }
                pinchZoomInstance = new PinchZoom(zoomContent, {
                    onZoomUpdate: () => {
                        clearTimeout(hiResRenderTimer);
                        hiResRenderTimer = setTimeout(renderHiResPage, 400);
                    }
                });
                
                return page.getTextContent();

            }).then(textContent => {
                const textLayerDiv = document.getElementById('text-layer');
                if(!textLayerDiv) return;
                textLayerDiv.innerHTML = '';
                textLayerDiv.style.width = pdfCanvas.width + 'px';
                textLayerDiv.style.height = pdfCanvas.height + 'px';
                pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });
                highlightMatchesOnPage(highlightMatchInPage);
            });
        }).finally(() => {
            pageRendering = false;
            document.getElementById('page-num').textContent = num;
        });
    }

    function queueRenderPage(num, highlightMatchInPage = null) {
        if (pageRendering) {
            pageNumPending = { num, highlight: highlightMatchInPage };
        } else {
            renderPage(num, highlightMatchInPage);
        }
    }

    function onPrevPage() {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    }

    function onNextPage() {
        if (pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    }

    function handlePdfSearch(event) {
        pdfSearchTerm = event.target.value;
        pdfSearchMatches = [];
        if (!pdfSearchTerm || pdfSearchTerm.length < 2) {
            highlightMatchesOnPage();
            updateSearchUIDisplay();
            return;
        }
        const cache = fileContentCache[currentPdfUrl];
        if (!cache) return;
        const searchTermLower = pdfSearchTerm.toLowerCase();
        cache.pageTexts.forEach((pageText, pageIndex) => {
            const regex = new RegExp(searchTermLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            let match;
            while ((match = regex.exec(pageText.toLowerCase())) !== null) {
                pdfSearchMatches.push({ pageNum: pageIndex + 1, matchIndex: match.index });
            }
        });
        currentMatchIndex = 0;
        navigateToMatch();
    }
    
    function highlightMatchesOnPage(currentMatch) {
        const textLayer = document.getElementById('text-layer');
        const textDivs = textLayer.querySelectorAll("span");
        textDivs.forEach(div => {
            let content = div.textContent;
            if(div.querySelector('mark')) {
                content = div.querySelector('mark').textContent;
            }
            div.innerHTML = '';
            div.appendChild(document.createTextNode(content));
        });

        if (!pdfSearchTerm || pdfSearchTerm.length < 2) return;
        
        const matchesOnPage = pdfSearchMatches.filter(m => m.pageNum === pageNum);
        let matchIndexInPage = 0;

        textDivs.forEach(div => {
            const text = div.textContent;
            const lowerText = text.toLowerCase();
            const regex = new RegExp(pdfSearchTerm.toLowerCase(), 'g');
            let match;
            let lastIndex = 0;
            const newContent = document.createDocumentFragment();

            while ((match = regex.exec(lowerText)) !== null) {
                newContent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                const mark = document.createElement('mark');
                mark.textContent = text.slice(match.index, match.index + pdfSearchTerm.length);
                
                if (currentMatch && match.index === currentMatch.matchIndex) {
                    mark.classList.add('current-highlight');
                    mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                
                newContent.appendChild(mark);
                lastIndex = regex.lastIndex;
                matchIndexInPage++;
            }
            newContent.appendChild(document.createTextNode(text.slice(lastIndex)));
            div.innerHTML = '';
            div.appendChild(newContent);
        });
    }

    function navigateToMatch() {
        if (pdfSearchMatches.length === 0) {
            highlightMatchesOnPage(null);
            updateSearchUIDisplay();
            return;
        }
        const match = pdfSearchMatches[currentMatchIndex];
        if (pageNum !== match.pageNum) {
            pageNum = match.pageNum;
            queueRenderPage(pageNum, match);
        } else {
            highlightMatchesOnPage(match);
        }
        updateSearchUIDisplay();
    }
    
    function goToPrevMatch() {
        if (pdfSearchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex - 1 + pdfSearchMatches.length) % pdfSearchMatches.length;
        navigateToMatch();
    }

    function goToNextMatch() {
        if (pdfSearchMatches.length === 0) return;
        currentMatchIndex = (currentMatchIndex + 1) % pdfSearchMatches.length;
        navigateToMatch();
    }

    function updateSearchUIDisplay() {
        const total = pdfSearchMatches.length;
        const current = total > 0 ? currentMatchIndex + 1 : 0;
        document.getElementById('pdf-search-results').textContent = `${current}/${total}`;
    }

    function setBuildTimestamp() {
        const timestampElement = document.getElementById('build-timestamp');
        if (timestampElement) {
            timestampElement.textContent = `Build: ${new Date().toISOString()}`;
        }
    }

    initializeApp();
});
/* Build Timestamp: 2025-09-26T09:42:43-06:00 */