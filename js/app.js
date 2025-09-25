/* /js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // --- DATA ---
    let binderData = [
        { id: 'tab-1', title: '1. Procedures', files: [], color: 1 },
        { id: 'tab-2', title: '2. Checklists', files: [], color: 2 },
        { id: 'tab-3', title: '3. Reference', files: [], color: 3 },
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
    let pdfSearchMatches = []; // Stores { pageNum, matchIndexInPage }
    let currentMatchIndex = 0; // Index into pdfSearchMatches array

    const pdfCanvas = document.getElementById('pdf-canvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;
    }

    // --- INITIALIZATION ---
    function initializeApp() {
        setBuildTimestamp();
        renderBinder(binderData);
        initializeEventListeners();
        binderData.forEach(tab => tab.files.forEach(file => cacheFileContent(file.path)));
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
        const sidebar = document.querySelector('.sidebar');
        const contentArea = document.querySelector('.content-area');
        if (!sidebar || !contentArea) return;
        let sidebarHTML = '';
        let contentHTML = '';
        data.forEach((tab, index) => {
            const isActive = index === 0 ? 'active' : '';
            if (!tab.color) tab.color = (index % tabColors) + 1;

            let colorPaletteHTML = '<div class="color-palette">';
            for (let i = 1; i <= tabColors; i++) {
                colorPaletteHTML += `<div class="color-swatch" style="background-color: var(--tab-color-${i})" data-tab-id="${tab.id}" data-color="${i}"></div>`;
            }
            colorPaletteHTML += '</div>';

            sidebarHTML += `
                <div class="tab-header" draggable="true" data-tab-id="${tab.id}">
                    <a href="#" class="tab ${isActive}" data-tab-target="#${tab.id}-content" data-tab-id="${tab.id}" data-color="${tab.color}">${tab.title}</a>
                    <div class="color-picker">
                        <span class="color-picker-icon">🎨</span>
                        ${colorPaletteHTML}
                    </div>
                </div>`;
            
            let fileListHTML = '<p>No files in this section.</p>';
            if (tab.files.length > 0) {
                fileListHTML = tab.files.map(file => `
                    <div class="file-item">
                        <div class="file-item-content" data-path="${file.path}" data-name="${file.name}">
                            <span class="file-name">${file.name}</span>
                            <span class="file-meta">Version: ${file.version} | Updated: ${file.date}</span>
                        </div>
                        <button class="delete-btn" data-tab-id="${tab.id}" data-file-name="${file.name}">&times;</button>
                    </div>
                `).join('');
            }
            contentHTML += `
                <div class="content-panel ${isActive}" id="${tab.id}-content">
                    <div class="content-panel-header"><h2>${tab.title}</h2></div>
                    <div class="file-list">${fileListHTML}</div>
                </div>`;
        });
        sidebar.innerHTML = sidebarHTML;
        contentArea.innerHTML = contentHTML;
    }

    function renderSearchResults(results, searchTerm) {
        const sidebar = document.querySelector('.sidebar');
        const contentArea = document.querySelector('.content-area');
        sidebar.innerHTML = '<p style="padding: 1rem;">Search Results</p>';
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
        const sidebar = document.querySelector('.sidebar');
        sidebar.addEventListener('click', handleSidebarClick);
        sidebar.addEventListener('dragstart', handleDragStart);
        sidebar.addEventListener('dragend', handleDragEnd);
        sidebar.addEventListener('dragover', handleDragOver);
        sidebar.addEventListener('drop', handleDrop);

        document.querySelector('.content-area').addEventListener('click', handleContentAreaClick);
        document.getElementById('search-input').addEventListener('input', handleSearch);
        document.getElementById('import-files-btn').addEventListener('click', () => document.getElementById('file-importer').click());
        document.getElementById('file-importer').addEventListener('change', handleFileImport);
        document.getElementById('modal-close-btn').addEventListener('click', () => closeModal('pdf-modal'));
        document.getElementById('prev-page-btn').addEventListener('click', onPrevPage);
        document.getElementById('next-page-btn').addEventListener('click', onNextPage);
        document.getElementById('pdf-search-input').addEventListener('input', handlePdfSearch);
        document.getElementById('pdf-search-prev').addEventListener('click', goToPrevMatch);
        document.getElementById('pdf-search-next').addEventListener('click', goToNextMatch);
        document.addEventListener('click', closeAllColorPalettes);
    }

    function handleSidebarClick(e) {
        if (e.target.matches('.color-picker-icon')) {
            toggleColorPalette(e);
        } else if (e.target.closest('.tab')) {
            handleTabClick(e);
        } else if (e.target.matches('.color-swatch')) {
            handleColorChange(e);
        }
    }

    function toggleColorPalette(e) {
        e.stopPropagation();
        const picker = e.target.closest('.color-picker');
        const palette = picker.querySelector('.color-palette');
        const header = picker.closest('.tab-header');
        const isVisible = palette.classList.contains('visible');
        
        closeAllColorPalettes();
        document.querySelectorAll('.tab-header').forEach(h => h.classList.remove('z-indexed'));

        if (!isVisible) {
            palette.classList.add('visible');
            header.classList.add('z-indexed');
        }
    }

    function closeAllColorPalettes() {
        document.querySelectorAll('.color-palette').forEach(p => p.classList.remove('visible'));
        document.querySelectorAll('.tab-header').forEach(h => h.classList.remove('z-indexed'));
    }

    function handleColorChange(e) {
        const tabId = e.target.dataset.tabId;
        const newColor = e.target.dataset.color;
        const tabData = binderData.find(t => t.id === tabId);
        if (tabData) {
            tabData.color = newColor;
        }
        const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.dataset.color = newColor;
        }
        updateActiveHeaderColor();
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
        const searchInput = document.getElementById('search-input');
        if (searchInput.value) {
            searchInput.value = '';
            renderBinder(binderData);
            setTimeout(updateActiveHeaderColor, 0);
        }
        const clickedTab = e.target.closest('.tab');
        document.querySelectorAll('.sidebar .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
        clickedTab.classList.add('active');
        const targetPanel = document.querySelector(clickedTab.dataset.tabTarget);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
        updateActiveHeaderColor();
    }
    
    function handleContentAreaClick(e) {
        if (e.target.matches('.delete-btn')) {
            deleteFile(e.target.dataset.tabId, e.target.dataset.fileName);
            return;
        }
        const fileItemContent = e.target.closest('.file-item-content');
        if (fileItemContent) {
            openModal(fileItemContent.dataset.path, fileItemContent.dataset.name);
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
        for (const tab of binderData) {
            for (const file of tab.files) {
                if (file.name.toLowerCase().includes(searchTerm) && !addedFileNames.has(file.name)) {
                    results.fileNameMatches.push(file);
                    addedFileNames.add(file.name);
                }
                const content = await getFileContent(file.path);
                const lowerCaseContent = content.toLowerCase();
                if (lowerCaseContent.includes(searchTerm)) {
                    const index = lowerCaseContent.indexOf(searchTerm);
                    const start = Math.max(0, index - 50);
                    const snippet = content.substring(start, start + 100);
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
            if (binderData.some(t => t.files.some(f => f.name === file.name))) {
                alert(`Duplicate file detected. Skipping: ${file.name}`);
                continue;
            }
            const parts = file.name.replace('.pdf', '').split('-');
            if (parts.length < 2) {
                alert(`Skipping invalid file name: ${file.name}`);
                continue;
            }
            const tabIndex = parseInt(parts[0], 10) - 1;
            if (isNaN(tabIndex) || !binderData[tabIndex]) {
                alert(`Skipping file with invalid tab index: ${file.name}`);
                continue;
            }
            const newFile = {
                name: file.name,
                version: 'v1.0',
                date: parts.slice(1).join('-'),
                path: `files/${file.name}`
            };
            binderData[tabIndex].files.push(newFile);
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
            delete fileContentCache[tab.files[fileIndex].path];
            tab.files.splice(fileIndex, 1);
        }
        renderBinder(binderData);
        updateActiveHeaderColor();
    }

    // --- DRAG AND DROP ---
    let draggedElement = null;

    function handleDragStart(e) {
        if (e.target.classList.contains('tab-header')) {
            draggedElement = e.target;
            setTimeout(() => e.target.classList.add('dragging'), 0);
        }
    }

    function handleDragEnd(e) {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            draggedElement = null;
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
        const sidebar = e.currentTarget;
        const afterElement = getDragAfterElement(sidebar, e.clientY);
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        if (afterElement) {
            afterElement.classList.add('drag-over');
        } else {
            // If dragging to the end, you might want a different indicator,
            // but for now, we'll just insert at the end.
        }
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.tab-header:not(.dragging)')];
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
        const sidebar = e.currentTarget;
        const afterElement = getDragAfterElement(sidebar, e.clientY);
        
        if (draggedElement) {
             if (afterElement == null) {
                sidebar.appendChild(draggedElement);
            } else {
                sidebar.insertBefore(draggedElement, afterElement);
            }
        }
        
        // Update the binderData array to match the new DOM order
        const newOrderIds = [...sidebar.querySelectorAll('.tab-header')].map(th => th.dataset.tabId);
        const newBinderData = newOrderIds.map(id => binderData.find(tab => tab.id === id));
        binderData = newBinderData;
    }
    
    
    // --- MODAL & PDF VIEWER ---
    function openModal(pdfUrl, fileName) {
        document.getElementById('pdf-title').textContent = fileName;
        document.getElementById('pdf-modal').classList.remove('hidden');
        currentPdfUrl = pdfUrl;
        
        pdfjsLib.getDocument(pdfUrl).promise.then(doc => {
            pdfDoc = doc;
            document.getElementById('page-count').textContent = pdfDoc.numPages;
            pageNum = 1;
            renderPage(pageNum);
        }).catch(err => {
            console.error('Error opening PDF:', err);
            alert(`Could not open PDF. Make sure you are running a local server and the file exists at: ${pdfUrl}`);
        });
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        pdfDoc = null;
        currentPdfUrl = '';
        pdfSearchTerm = '';
        pdfSearchMatches = [];
        document.getElementById('pdf-search-input').value = '';
        pdfCtx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
    }

    function renderPage(num, highlightMatchInPage = null) {
        pageRendering = true;
        pdfDoc.getPage(num).then(page => {
            const container = document.querySelector('.modal-body');
            const desiredWidth = container.clientWidth * 0.98;
            const viewportAtScale1 = page.getViewport({ scale: 1 });
            const scale = desiredWidth / viewportAtScale1.width;
            const viewport = page.getViewport({ scale: scale });
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            const renderContext = { canvasContext: pdfCtx, viewport: viewport };
            page.render(renderContext).promise.then(() => {
                pageRendering = false;
                if (pageNumPending !== null) {
                    renderPage(pageNumPending.num, pageNumPending.highlight);
                    pageNumPending = null;
                }
                return page.getTextContent();
            }).then(textContent => {
                const textLayerDiv = document.getElementById('text-layer');
                textLayerDiv.innerHTML = '';
                textLayerDiv.style.width = pdfCanvas.width + 'px';
                textLayerDiv.style.height = pdfCanvas.height + 'px';
                pdfjsLib.renderTextLayer({ textContent, container: textLayerDiv, viewport, textDivs: [] });
                highlightMatchesOnPage(highlightMatchInPage);
            });
        });
        document.getElementById('page-num').textContent = num;
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
            let matchInPageIndex = 0;
            while ((match = regex.exec(pageText.toLowerCase())) !== null) {
                pdfSearchMatches.push({ pageNum: pageIndex + 1, matchIndexInPage: matchInPageIndex++ });
            }
        });
        currentMatchIndex = 0;
        navigateToMatch();
    }
    
    function highlightMatchesOnPage(highlightIndexInPage = null) {
        const textLayer = document.getElementById('text-layer');
        const highlights = textLayer.querySelectorAll('mark');
        highlights.forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
        if (!pdfSearchTerm || pdfSearchTerm.length < 2) return;
        
        const textDivs = Array.from(textLayer.querySelectorAll('span'));
        if (textDivs.length === 0) return;

        const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
        const allTextNodes = [];
        let node;
        while(node = walker.nextNode()) {
            allTextNodes.push(node);
        }

        const regex = new RegExp(pdfSearchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        allTextNodes.forEach(textNode => {
            let match;
            let lastIndex = 0;
            const text = textNode.textContent;
            const fragment = document.createDocumentFragment();
            
            while ((match = regex.exec(text)) !== null) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                const mark = document.createElement('mark');
                mark.textContent = match[0];
                fragment.appendChild(mark);
                lastIndex = regex.lastIndex;
            }
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
            textNode.parentNode.replaceChild(fragment, textNode);
        });
        
        const allMarks = textLayer.querySelectorAll('mark');
        if (highlightIndexInPage !== null && allMarks[highlightIndexInPage]) {
            allMarks[highlightIndexInPage].classList.add('current-highlight');
            allMarks[highlightIndexInPage].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
    }

    function navigateToMatch() {
        if (pdfSearchMatches.length === 0) {
            highlightMatchesOnPage();
            updateSearchUIDisplay();
            return;
        }
        const match = pdfSearchMatches[currentMatchIndex];
        if (pageNum !== match.pageNum) {
            pageNum = match.pageNum;
            queueRenderPage(pageNum, match.matchIndexInPage);
        } else {
            highlightMatchesOnPage(match.matchIndexInPage);
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
            timestampElement.textContent = `Build: ${new Date().toUTCString()}`;
        }
    }

    initializeApp();
});
/* Build Timestamp: Thu, 25 Sep 2025 08:20:37 GMT */