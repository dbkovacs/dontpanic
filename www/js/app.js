/* /www/js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // --- STATE ---
    let db = {}; // In-memory database for binder structure
    let fileCache = {}; // Cache for PDF file objects
    let textCache = {}; // Cache for extracted PDF text content
    let activeTabId = null;
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let currentPinchZoom = null; // To hold the pinch-zoom instance

    // --- DOM ELEMENTS ---
    const tabsContainer = document.getElementById('tabs-container');
    const contentContainer = document.getElementById('content-container');
    const importBtn = document.getElementById('import-files-btn');
    const fileInput = document.getElementById('file-input');
    const buildTimestampEl = document.getElementById('build-timestamp');
    const searchInput = document.getElementById('search-input');
    const searchResultsModal = document.getElementById('search-results-modal');
    const searchResultsContent = document.getElementById('search-results-content');
    const searchResultsCloseBtn = document.getElementById('search-results-close-btn');

    // PDF Viewer Elements
    const pdfViewerModal = document.getElementById('pdf-viewer-modal');
    const pdfViewerCloseBtn = document.getElementById('pdf-viewer-close-btn');
    const pdfViewerTitle = document.getElementById('pdf-viewer-title');
    const pdfViewerContainer = document.getElementById('pdf-viewer-container');
    const pageNumEl = document.getElementById('page-num');
    const pageCountEl = document.getElementById('page-count');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomFitBtn = document.getElementById('zoom-fit');

    // PDF Search Elements
    const pdfSearchInput = document.getElementById('pdf-search-input');
    const pdfSearchPrevBtn = document.getElementById('pdf-search-prev');
    const pdfSearchNextBtn = document.getElementById('pdf-search-next');
    const pdfSearchCountEl = document.getElementById('pdf-search-count');


    // --- INITIALIZATION ---
    function init() {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/lib/pdf.worker.min.js';
        loadState();
        renderTabs();
        if (activeTabId) {
            renderContent(activeTabId);
        } else if (Object.keys(db).length > 0) {
            // If no active tab, default to the first one
            const firstTabId = Object.keys(db)[0];
            setActiveTab(firstTabId);
        }
        updateBuildTimestamp();
        initEventListeners();
    }

    function initEventListeners() {
        importBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileImport);
        searchInput.addEventListener('input', handleGlobalSearch);
        searchResultsCloseBtn.addEventListener('click', () => searchResultsModal.classList.add('modal-hidden'));

        // PDF Viewer Controls
        pdfViewerCloseBtn.addEventListener('click', closePdfViewer);
        prevPageBtn.addEventListener('click', onPrevPage);
        nextPageBtn.addEventListener('click', onNextPage);
        zoomInBtn.addEventListener('click', () => currentPinchZoom && currentPinchZoom.zoomIn());
        zoomOutBtn.addEventListener('click', () => currentPinchZoom && currentPinchZoom.zoomOut());
        zoomFitBtn.addEventListener('click', () => currentPinchZoom && currentPinchZoom.scaleTo(1));

    }

    // --- STATE MANAGEMENT ---
    function saveState() {
        localStorage.setItem('digitalBinderDB', JSON.stringify(db));
        localStorage.setItem('activeTabId', activeTabId);
    }

    function loadState() {
        db = JSON.parse(localStorage.getItem('digitalBinderDB')) || {
            'tab-1': { id: 'tab-1', title: 'Section 1', color: '#3498db', files: [] },
            'tab-2': { id: 'tab-2', title: 'Section 2', color: '#2ecc71', files: [] },
            'tab-3': { id: 'tab-3', title: 'Section 3', color: '#e74c3c', files: [] },
        };
        activeTabId = localStorage.getItem('activeTabId');
    }

    // --- UI RENDERING ---
    function renderTabs() {
        tabsContainer.innerHTML = '';
        Object.values(db).forEach(tab => {
            const tabEl = document.createElement('div');
            tabEl.className = 'tab';
            tabEl.textContent = tab.title;
            tabEl.dataset.tabId = tab.id;
            tabEl.style.setProperty('--tab-active-bg', tab.color);
            tabEl.style.setProperty('--tab-active-text', '#fff');

            if (tab.id === activeTabId) {
                tabEl.classList.add('active');
            }

            tabEl.addEventListener('click', () => setActiveTab(tab.id));
            tabsContainer.appendChild(tabEl);
        });
    }

    function renderContent(tabId) {
        const tab = db[tabId];
        if (!tab) return;

        contentContainer.innerHTML = '';
        const header = document.createElement('div');
        header.className = 'content-panel-header';
        header.style.borderColor = tab.color;
        header.innerHTML = `<h2>${tab.title}</h2>`;
        contentContainer.appendChild(header);

        const fileList = document.createElement('div');
        tab.files.forEach(fileInfo => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span class="file-name">${fileInfo.name}</span>
                <button class="delete-file-btn" data-file-id="${fileInfo.id}">&times;</button>
            `;
            fileItem.querySelector('.file-name').addEventListener('click', () => openPdfViewer(fileInfo));
            fileItem.querySelector('.delete-file-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFile(fileInfo.id, tabId);
            });
            fileList.appendChild(fileItem);
        });
        contentContainer.appendChild(fileList);
    }

    function setActiveTab(tabId) {
        activeTabId = tabId;
        saveState();
        renderTabs();
        renderContent(tabId);
    }

    function updateBuildTimestamp() {
        const now = new Date();
        const formattedDate = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        buildTimestampEl.textContent = `Build: ${formattedDate}`;
    }


    // --- FILE HANDLING ---
    async function handleFileImport(event) {
        const files = event.target.files;
        for (const file of files) {
            const fileId = `file-${Date.now()}-${Math.random()}`;
            const fileInfo = { id: fileId, name: file.name, tabId: null };

            // Intelligent tab assignment (simple version)
            const assignedTabId = Object.keys(db).find(id => file.name.toLowerCase().includes(db[id].title.toLowerCase().slice(0, -2))) || activeTabId || Object.keys(db)[0];
            
            if (assignedTabId) {
                fileInfo.tabId = assignedTabId;
                db[assignedTabId].files.push(fileInfo);
                fileCache[fileId] = file;
                await cachePdfText(file, fileId);
            }
        }
        saveState();
        renderContent(activeTabId);
    }

    async function cachePdfText(file, fileId) {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }
        textCache[fileId] = fullText;
        console.log(`Text cached for ${file.name}`);
    }

    function deleteFile(fileId, tabId) {
        if (confirm('Are you sure you want to delete this file?')) {
            db[tabId].files = db[tabId].files.filter(f => f.id !== fileId);
            delete fileCache[fileId];
            delete textCache[fileId];
            saveState();
            renderContent(tabId);
        }
    }

    // --- GLOBAL SEARCH ---
    function handleGlobalSearch(event) {
        const query = event.target.value.toLowerCase();
        if (query.length < 3) {
            searchResultsModal.classList.add('modal-hidden');
            return;
        }

        let resultsHTML = '';
        const matchingFiles = [];
        const contentMentions = [];

        Object.values(db).forEach(tab => {
            tab.files.forEach(file => {
                // Search filenames
                if (file.name.toLowerCase().includes(query)) {
                    matchingFiles.push({ file, tab });
                }
                // Search content
                const text = textCache[file.id];
                if (text && text.toLowerCase().includes(query)) {
                    const snippet = createSnippet(text, query);
                    if (snippet) {
                        contentMentions.push({ file, tab, snippet });
                    }
                }
            });
        });

        if (matchingFiles.length > 0) {
            resultsHTML += '<h3>Matching Files</h3>';
            matchingFiles.forEach(result => {
                resultsHTML += `<div class="search-result-item" data-file-id="${result.file.id}" data-tab-id="${result.tab.id}">
                    <p><strong>${highlight(result.file.name, query)}</strong> in ${result.tab.title}</p>
                </div>`;
            });
        }

        if (contentMentions.length > 0) {
            resultsHTML += '<h3>Content Mentions</h3>';
            contentMentions.forEach(result => {
                resultsHTML += `<div class="search-result-item" data-file-id="${result.file.id}" data-tab-id="${result.tab.id}">
                    <p><strong>${result.file.name}</strong></p>
                    <p>${result.snippet}</p>
                </div>`;
            });
        }

        if (resultsHTML) {
            searchResultsContent.innerHTML = resultsHTML;
            searchResultsModal.classList.remove('modal-hidden');
            // Add event listeners to new results
            searchResultsContent.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('click', () => {
                    const fileId = item.dataset.fileId;
                    const tabId = item.dataset.tabId;
                    const fileInfo = db[tabId].files.find(f => f.id === fileId);
                    if (fileInfo) {
                        searchResultsModal.classList.add('modal-hidden');
                        openPdfViewer(fileInfo);
                    }
                });
            });
        } else {
            searchResultsModal.classList.add('modal-hidden');
        }
    }
    
    function createSnippet(text, query) {
        const index = text.toLowerCase().indexOf(query);
        if (index === -1) return null;
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 50);
        let snippet = text.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < text.length) snippet = snippet + '...';
        return highlight(snippet, query);
    }
    
    function highlight(text, query) {
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }
    
    // --- PDF VIEWER ---
    async function openPdfViewer(fileInfo) {
        const file = fileCache[fileInfo.id];
        if (!file) return;

        pdfViewerTitle.textContent = file.name;
        pdfViewerModal.classList.remove('modal-hidden');
        
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        pdfDoc = await loadingTask.promise;
        pageCountEl.textContent = pdfDoc.numPages;
        pageNum = 1;
        renderPage(pageNum);
    }

    function closePdfViewer() {
        pdfViewerModal.classList.add('modal-hidden');
        pdfDoc = null;
        if (currentPinchZoom) {
            currentPinchZoom.destroy();
            currentPinchZoom = null;
        }
    }

    function renderPage(num) {
        pageRendering = true;
        pageNumEl.textContent = num;
    
        pdfDoc.getPage(num).then(function(page) {
            const viewport = page.getViewport({ scale: 1.5 });
            
            // Prepare canvas using PDF page dimensions
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // Clean up previous content and zoom instance
            pdfViewerContainer.innerHTML = '';
            pdfViewerContainer.appendChild(canvas);
            
            if (currentPinchZoom) {
                currentPinchZoom.destroy();
                currentPinchZoom = null;
            }
    
            // Render PDF page into canvas context
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            const renderTask = page.render(renderContext);
    
            // Wait for rendering to finish
            renderTask.promise.then(function() {
                pageRendering = false;
                if (pageNumPending !== null) {
                    // New page rendering is pending
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
                // Initialize PinchZoom on the CONTAINER, not the canvas
                currentPinchZoom = new PinchZoom(pdfViewerContainer, {});
            });
        });
    }

    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    }

    function onPrevPage() {
        if (pageNum <= 1) {
            return;
        }
        pageNum--;
        queueRenderPage(pageNum);
    }

    function onNextPage() {
        if (pageNum >= pdfDoc.numPages) {
            return;
        }
        pageNum++;
        queueRenderPage(pageNum);
    }

    // --- INITIALIZE THE APP ---
    init();
});
/* Build: 2025-09-26 10:00:15 */
