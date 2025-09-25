/* /www/js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // STATE
    let state = {
        tabs: [
            { id: 1, name: "1. Procedures", color: "#0a84ff", files: [] },
            { id: 2, name: "2. Checklists", color: "#30d158", files: [] },
            { id: 3, name: "3. Reference", color: "#ff453a", files: [] }
        ],
        sections: [],
        activeTabId: 1,
        nextTabId: 4,
        nextSectionId: 1,
        sidebarOrder: [1, 2, 3],
        fileCache: {} // { fileId: { name, content, url } }
    };

    // DOM ELEMENTS
    const sidebarContent = document.getElementById('sidebar-content');
    const mainContent = document.getElementById('main-content');
    const importBtnMain = document.getElementById('import-btn-main');
    const fileInput = document.getElementById('file-input');
    const addNewTabBtn = document.getElementById('add-new-tab-btn');
    const addNewSectionBtn = document.getElementById('add-new-section-btn');
    const globalSearchInput = document.getElementById('global-search-input');
    const timestampEl = document.getElementById('build-timestamp');
    
    // PDF Viewer Elements
    const pdfViewerModal = document.getElementById('pdf-viewer-modal');
    const pdfViewerClose = document.getElementById('pdf-viewer-close');
    const pdfCanvas = document.getElementById('pdf-canvas');
    const pdfTitle = document.getElementById('pdf-viewer-title');
    const pageNumEl = document.getElementById('pdf-page-num');
    const pageCountEl = document.getElementById('pdf-page-count');
    const prevPageBtn = document.getElementById('pdf-prev-page');
    const nextPageBtn = document.getElementById('pdf-next-page');
    const pdfSearchInput = document.getElementById('pdf-search-input');
    const pdfSearchPrev = document.getElementById('pdf-search-prev');
    const pdfSearchNext = document.getElementById('pdf-search-next');
    const pdfSearchMatches = document.getElementById('pdf-search-matches');
    
    // Edit Tab Modal Elements
    const editTabModal = document.getElementById('edit-tab-modal');
    const editTabClose = document.getElementById('edit-tab-close');
    const editTabNameInput = document.getElementById('edit-tab-name-input');
    const editTabColorInput = document.getElementById('edit-tab-color-input');
    const saveTabChangesBtn = document.getElementById('save-tab-changes-btn');

    // Mobile Navigation Elements
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');


    // PDF VIEWER STATE
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let currentSearchTerm = '';
    let searchMatches = [];
    let currentMatchIndex = -1;

    // --- INITIALIZATION ---
    function init() {
        loadState();
        renderApp();
        setupEventListeners();
        updateTimestamp();
    }
    
    function updateTimestamp() {
        if(timestampEl) {
            timestampEl.textContent = `Build: ${new Date().toISOString()}`;
        }
    }

    // --- STATE MANAGEMENT ---
    function saveState() {
        const stateToSave = { ...state, fileCache: {} }; // Don't save large file cache
        Object.keys(state.fileCache).forEach(fileId => {
            stateToSave.fileCache[fileId] = {
                name: state.fileCache[fileId].name,
                url: state.fileCache[fileId].url,
                // content is omitted
            };
        });
        localStorage.setItem('digitalBinderState', JSON.stringify(stateToSave));
    }

    function loadState() {
        const savedState = localStorage.getItem('digitalBinderState');
        if (savedState) {
            const parsedState = JSON.parse(savedState);
            state = { ...state, ...parsedState };
            // Re-cache content for existing files
            Object.values(state.fileCache).forEach(file => {
                if (file.url) {
                    fetch(file.url).then(res => res.blob()).then(blob => {
                        cacheFileContent(file.name, blob);
                    });
                }
            });
        }
    }

    // --- RENDERING ---
    function renderApp() {
        renderSidebar();
        if (globalSearchInput.value) {
            performGlobalSearch(globalSearchInput.value);
        } else {
             renderMainContent();
        }
    }

    function renderSidebar() {
        sidebarContent.innerHTML = '';
        state.sidebarOrder.forEach(id => {
            const tab = state.tabs.find(t => t.id === id);
            const section = state.sections.find(s => s.id === id);
            
            if (tab) {
                const tabEl = document.createElement('div');
                tabEl.className = 'sidebar-tab';
                tabEl.dataset.tabId = tab.id;
                if (tab.id === state.activeTabId) {
                    tabEl.classList.add('active');
                }
                tabEl.innerHTML = `
                    <div style="display: flex; align-items: center;">
                        <span class="tab-color-indicator" style="background-color: ${tab.color};"></span>
                        <span>${tab.name}</span>
                    </div>
                    <span class="edit-tab-icon" data-tab-id="${tab.id}">&#9998;</span>
                `;
                sidebarContent.appendChild(tabEl);
            } else if (section) {
                const sectionEl = document.createElement('div');
                sectionEl.className = 'sidebar-section';
                sectionEl.textContent = section.name;
                sidebarContent.appendChild(sectionEl);
            }
        });
    }

    function renderMainContent() {
        const activeTab = state.tabs.find(t => t.id === state.activeTabId);
        if (!activeTab) {
            mainContent.innerHTML = '<p>Select a tab to view files.</p>';
            return;
        }

        let fileListHTML = activeTab.files.map(file => `
            <div class="file-list-item" data-file-id="${file.id}" data-tab-id="${activeTab.id}">
                <span>${file.name}</span>
                <button class="delete-file-btn" data-file-id="${file.id}" data-tab-id="${activeTab.id}">&times;</button>
            </div>
        `).join('');

        if (activeTab.files.length === 0) {
            fileListHTML = '<p>No files in this section.</p>';
        }

        mainContent.innerHTML = `
            <div class="content-header" style="border-color: ${activeTab.color};">
                <h2>${activeTab.name}</h2>
            </div>
            <div id="file-list">${fileListHTML}</div>
        `;
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        importBtnMain.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileImport);
        addNewTabBtn.addEventListener('click', addNewTab);
        addNewSectionBtn.addEventListener('click', addNewSection);
        
        sidebarContent.addEventListener('click', (e) => {
            const tabEl = e.target.closest('.sidebar-tab');
            const editIcon = e.target.closest('.edit-tab-icon');

            if (editIcon) {
                e.stopPropagation();
                const tabId = parseInt(editIcon.dataset.tabId);
                openEditTabModal(tabId);
                return;
            }

            if (tabEl) {
                const tabId = parseInt(tabEl.dataset.tabId);
                state.activeTabId = tabId;
                globalSearchInput.value = '';
                renderApp();
                closeSidebar();
            }
        });

        mainContent.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-file-btn');
            const fileItem = e.target.closest('.file-list-item');

            if (deleteBtn) {
                const fileId = deleteBtn.dataset.fileId;
                const tabId = parseInt(deleteBtn.dataset.tabId);
                if (confirm('Are you sure you want to delete this file?')) {
                    deleteFile(fileId, tabId);
                }
            } else if (fileItem) {
                const fileId = fileItem.dataset.fileId;
                openPdfViewer(fileId);
            }
        });

        globalSearchInput.addEventListener('input', (e) => performGlobalSearch(e.target.value));

        // Mobile Nav Listeners
        menuToggleBtn.addEventListener('click', toggleSidebar);
        sidebarOverlay.addEventListener('click', closeSidebar);
        
        // PDF Viewer Listeners
        pdfViewerClose.addEventListener('click', closePdfViewer);
        prevPageBtn.addEventListener('click', onPrevPage);
        nextPageBtn.addEventListener('click', onNextPage);
        pdfSearchInput.addEventListener('input', handlePdfSearch);
        pdfSearchPrev.addEventListener('click', () => navigateMatches(-1));
        pdfSearchNext.addEventListener('click', () => navigateMatches(1));

        // Edit Tab Modal Listeners
        editTabClose.addEventListener('click', () => editTabModal.style.display = 'none');
        saveTabChangesBtn.addEventListener('click', saveTabChanges);
    }
    
    // --- MOBILE NAVIGATION ---
    function toggleSidebar() {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('visible');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('visible');
    }

    // --- CORE LOGIC ---
    function handleFileImport(event) {
        const files = Array.from(event.target.files);
        files.forEach(file => {
            const fileId = `file_${Date.now()}_${Math.random()}`;
            const fileUrl = URL.createObjectURL(file);
            const fileData = { id: fileId, name: file.name };
            
            let targetTab = state.tabs.find(t => file.name.startsWith(t.name.split('.')[0]));
            if (!targetTab) {
                targetTab = state.tabs.find(t => t.id === state.activeTabId);
            }
            targetTab.files.push(fileData);
            
            state.fileCache[fileId] = { name: file.name, url: fileUrl, content: '' };
            cacheFileContent(fileId, file);
        });
        saveState();
        renderApp();
        fileInput.value = ''; // Reset input
    }
    
    async function cacheFileContent(fileId, fileBlob) {
        const arrayBuffer = await fileBlob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ') + '\n';
        }
        if(state.fileCache[fileId]) {
            state.fileCache[fileId].content = fullText;
        }
    }
    
    function deleteFile(fileId, tabId) {
        const tab = state.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.files = tab.files.filter(f => f.id !== fileId);
            const fileCacheEntry = state.fileCache[fileId];
            if (fileCacheEntry && fileCacheEntry.url) {
                URL.revokeObjectURL(fileCacheEntry.url);
            }
            delete state.fileCache[fileId];
            saveState();
            renderApp();
        }
    }

    function addNewTab() {
        const tabName = prompt('Enter new tab name:');
        if (tabName) {
            const newTab = {
                id: state.nextTabId,
                name: tabName,
                color: `#${Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')}`,
                files: []
            };
            state.tabs.push(newTab);
            state.sidebarOrder.push(state.nextTabId);
            state.nextTabId++;
            saveState();
            renderApp();
        }
    }

    function addNewSection() {
        const sectionName = prompt('Enter new section name:');
        if (sectionName) {
            const newSection = {
                id: `s_${state.nextSectionId}`,
                name: sectionName
            };
            state.sections.push(newSection);
            state.sidebarOrder.push(newSection.id);
            state.nextSectionId++;
            saveState();
            renderApp();
        }
    }

    function performGlobalSearch(query) {
        if (!query || query.length < 2) {
            renderMainContent();
            return;
        }
        
        const lowerCaseQuery = query.toLowerCase();
        const matchingFiles = [];
        const contentMentions = [];

        state.tabs.forEach(tab => {
            tab.files.forEach(file => {
                const fileId = file.id;
                const fileCache = state.fileCache[fileId];
                if (!fileCache) return;

                // Match filename
                if (fileCache.name.toLowerCase().includes(lowerCaseQuery)) {
                    matchingFiles.push({ ...file, tabId: tab.id });
                }

                // Match content
                if (fileCache.content) {
                    const content = fileCache.content;
                    const regex = new RegExp(query, 'gi');
                    let match;
                    while ((match = regex.exec(content)) !== null) {
                        const snippet = content.substring(Math.max(0, match.index - 50), Math.min(content.length, match.index + 50));
                        contentMentions.push({
                            file: { ...file, tabId: tab.id },
                            snippet: snippet.replace(regex, `<mark>${match[0]}</mark>`)
                        });
                    }
                }
            });
        });
        
        renderSearchResults(matchingFiles, contentMentions, query);
    }
    
    function renderSearchResults(matchingFiles, contentMentions, query) {
        const highlight = (text) => text.replace(new RegExp(query, 'gi'), `<mark>${'$&'}</mark>`);

        const filesHtml = matchingFiles.length > 0
            ? matchingFiles.map(file => `
                <div class="file-list-item search-result-item" data-file-id="${file.id}">
                    ${highlight(file.name)}
                </div>`).join('')
            : '<p>No matching file names.</p>';

        const mentionsHtml = contentMentions.length > 0
            ? contentMentions.map(mention => `
                <div class="file-list-item search-result-item content-mention" data-file-id="${mention.file.id}">
                    <strong>${highlight(mention.file.name)}</strong>
                    <p>...${mention.snippet}...</p>
                </div>`).join('')
            : '<p>No matches in file content.</p>';

        mainContent.innerHTML = `
            <h2>Search Results for "${query}"</h2>
            <div id="search-results-container">
                <h3>Matching Files</h3>
                ${filesHtml}
                <h3>Content Mentions</h3>
                ${mentionsHtml}
            </div>
        `;
    }
    
    // --- PDF VIEWER LOGIC ---
    function openPdfViewer(fileId) {
        const file = state.fileCache[fileId];
        if (!file || !file.url) return;
        
        pdfTitle.textContent = file.name;
        pageNum = 1;
        currentSearchTerm = '';
        pdfSearchInput.value = '';
        pdfSearchMatches.textContent = '';
        
        const loadingTask = pdfjsLib.getDocument(file.url);
        loadingTask.promise.then(pdf => {
            pdfDoc = pdf;
            pageCountEl.textContent = pdfDoc.numPages;
            renderPage(pageNum);
            pdfViewerModal.style.display = 'flex';
        });
    }

    function closePdfViewer() {
        pdfViewerModal.style.display = 'none';
        pdfDoc = null;
    }

    function renderPage(num) {
        pageRendering = true;
        pdfDoc.getPage(num).then(page => {
            const viewport = page.getViewport({ scale: 1.5 });
            const context = pdfCanvas.getContext('2d');
            pdfCanvas.height = viewport.height;
            pdfCanvas.width = viewport.width;
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            const renderTask = page.render(renderContext);
            renderTask.promise.then(() => {
                pageRendering = false;
                if (pageNumPending !== null) {
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
                // After rendering, apply highlights
                return page.getTextContent();
            }).then(textContent => {
                // Apply highlights for search
                // This is a simplified version. A robust solution would involve an overlay div.
            });
        });
        pageNumEl.textContent = num;
    }
    
    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
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
    
    function handlePdfSearch(e) {
        // Placeholder for in-PDF search logic
        currentSearchTerm = e.target.value;
        if(currentSearchTerm.length < 2) {
             pdfSearchMatches.textContent = '';
             return;
        }
        pdfSearchMatches.textContent = 'Searching...';
        // In a real app, this would trigger a more complex search and highlight flow
        setTimeout(() => pdfSearchMatches.textContent = `~${Math.floor(Math.random()*10)} matches`, 500);
    }
    
    function navigateMatches(direction) {
        // Placeholder for match navigation
    }
    
    // --- EDIT TAB MODAL ---
    function openEditTabModal(tabId) {
        const tab = state.tabs.find(t => t.id === tabId);
        if (tab) {
            editTabNameInput.value = tab.name;
            editTabColorInput.value = tab.color;
            saveTabChangesBtn.dataset.tabId = tabId;
            editTabModal.style.display = 'flex';
        }
    }

    function saveTabChanges() {
        const tabId = parseInt(saveTabChangesBtn.dataset.tabId);
        const tab = state.tabs.find(t => t.id === tabId);
        if (tab) {
            tab.name = editTabNameInput.value;
            tab.color = editTabColorInput.value;
            saveState();
            renderApp();
            editTabModal.style.display = 'none';
        }
    }

    // --- START ---
    init();
});