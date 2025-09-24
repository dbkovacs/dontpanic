/* /js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // --- DATA ---
    let binderData = [
        { id: 'tab-1', title: 'Procedures', files: [] },
        { id: 'tab-2', title: 'Checklists', files: [] },
        { id: 'tab-3', title: 'Reference', files: [] },
    ];
    
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js`;

    // --- INITIALIZATION ---
    function initializeApp() {
        setBuildTimestamp();
        renderBinder(binderData);
        initializeEventListeners();
    }

    // --- RENDERING ---
    function renderBinder(data) {
        const sidebar = document.querySelector('.sidebar');
        const contentArea = document.querySelector('.content-area');
        if (!sidebar || !contentArea) return;

        let sidebarHTML = '';
        let contentHTML = '';
        
        data.forEach((tab, index) => {
            const isActive = index === 0 ? 'active' : '';
            sidebarHTML += `<a href="#" class="tab ${isActive}" data-tab-target="#${tab.id}-content">${index + 1}. ${tab.title}</a>`;
            
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
                    <div class="content-panel-header">
                        <h2>${index + 1}. ${tab.title}</h2>
                    </div>
                    <div class="file-list">${fileListHTML}</div>
                </div>
            `;
        });
        
        // Handle case where there are no search results
        if (data.length === 0) {
            sidebarHTML = '<p style="padding: 1rem;">No matching tabs.</p>';
            contentHTML = '<p style="padding: 1rem;">No results found.</p>';
        }

        sidebar.innerHTML = sidebarHTML;
        contentArea.innerHTML = contentHTML;
    }

    function renderPdf(url, canvas) {
        const loadingTask = pdfjsLib.getDocument(url);
        loadingTask.promise.then(pdf => {
            return pdf.getPage(1);
        }).then(page => {
            const container = document.querySelector('.modal-body');
            const containerWidth = container.clientWidth - (parseFloat(getComputedStyle(container).paddingLeft) * 2);
            const viewportAtScale1 = page.getViewport({ scale: 1 });
            const scale = containerWidth / viewportAtScale1.width;
            const viewport = page.getViewport({ scale });
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const renderContext = { canvasContext: context, viewport: viewport };
            page.render(renderContext);
        }).catch(err => {
            console.error('Error rendering PDF:', err);
            alert(`Could not load PDF. Make sure you are running a local server and the file exists at: ${url}`);
        });
    }

    // --- EVENT LISTENERS & HANDLERS ---
    function initializeEventListeners() {
        document.querySelector('.sidebar').addEventListener('click', handleTabClick);
        document.querySelector('.content-area').addEventListener('click', handleContentAreaClick);
        document.getElementById('modal-close-btn').addEventListener('click', () => closeModal('pdf-modal'));
        document.getElementById('import-files-btn').addEventListener('click', () => {
            document.getElementById('file-importer').click();
        });
        document.getElementById('file-importer').addEventListener('change', handleFileImport);
        // Add listener for the search input
        document.getElementById('search-input').addEventListener('input', handleSearch);
    }

    function handleTabClick(e) {
        if (!e.target.matches('.tab')) return;
        e.preventDefault();
        const clickedTab = e.target;
        
        document.querySelectorAll('.sidebar .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));

        clickedTab.classList.add('active');
        const targetPanel = document.querySelector(clickedTab.dataset.tabTarget);
        if (targetPanel) targetPanel.classList.add('active');
    }
    
    function handleContentAreaClick(e) {
        if (e.target.matches('.delete-btn')) {
            const tabId = e.target.dataset.tabId;
            const fileName = e.target.dataset.fileName;
            deleteFile(tabId, fileName);
            return;
        }

        const fileItemContent = e.target.closest('.file-item-content');
        if (fileItemContent) {
            const filePath = fileItemContent.dataset.path;
            const fileName = fileItemContent.dataset.name;
            openModal(filePath, fileName);
        }
    }
    
    // New function to handle search input
    function handleSearch(e) {
        const searchTerm = e.target.value.toLowerCase();

        if (!searchTerm) {
            renderBinder(binderData); // If search is cleared, show all data
            return;
        }

        const filteredData = binderData.map(tab => {
            const matchingFiles = tab.files.filter(file => 
                file.name.toLowerCase().includes(searchTerm)
            );
            const tabTitleMatches = tab.title.toLowerCase().includes(searchTerm);

            if (tabTitleMatches || matchingFiles.length > 0) {
                return {
                    ...tab,
                    files: tabTitleMatches ? tab.files : matchingFiles
                };
            }
            return null;
        }).filter(tab => tab !== null);

        renderBinder(filteredData);
    }

    function handleFileImport(e) {
        const files = e.target.files;
        if (!files.length) return;

        for (const file of files) {
            const alreadyExists = binderData.some(tab => 
                tab.files.some(existingFile => existingFile.name === file.name)
            );

            if (alreadyExists) {
                alert(`Duplicate file detected. Skipping: ${file.name}`);
                continue;
            }

            const parts = file.name.replace('.pdf', '').split('-');
            if (parts.length < 2) {
                alert(`Skipping invalid file name: ${file.name}`);
                continue;
            }

            const tabIndex = parseInt(parts[0], 10) - 1;
            const dateStr = parts.slice(1).join('-');

            if (isNaN(tabIndex) || !binderData[tabIndex]) {
                alert(`Skipping file with invalid tab index: ${file.name}`);
                continue;
            }

            const newFile = {
                name: file.name,
                version: 'v1.0',
                date: dateStr,
                path: `files/${file.name}`
            };

            binderData[tabIndex].files.push(newFile);
        }
        
        renderBinder(binderData);
        e.target.value = '';
    }

    function deleteFile(tabId, fileName) {
        const confirmation = confirm(`Are you sure you want to delete the file "${fileName}"?`);
        if (!confirmation) return;
        
        const tab = binderData.find(t => t.id === tabId);
        if (!tab) return;

        const fileIndex = tab.files.findIndex(f => f.name === fileName);
        if (fileIndex > -1) {
            tab.files.splice(fileIndex, 1);
        }
        
        renderBinder(binderData);
    }
    
    // --- MODAL CONTROLS ---
    function openModal(pdfUrl, fileName) {
        const modal = document.getElementById('pdf-modal');
        const titleEl = document.getElementById('pdf-title');
        titleEl.textContent = fileName;
        modal.classList.remove('hidden');
        renderPdf(pdfUrl, document.getElementById('pdf-canvas'));
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
        if (modalId === 'pdf-modal') {
            const canvas = document.getElementById('pdf-canvas');
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // --- UTILITIES & START ---
    function setBuildTimestamp() {
        const timestampElement = document.getElementById('build-timestamp');
        if (timestampElement) {
            const now = new Date();
            timestampElement.textContent = `Build: ${now.toLocaleString()}`;
        }
    }

    initializeApp();
});
/* Build Timestamp: Wed, 24 Sep 2025 17:37:05 GMT */