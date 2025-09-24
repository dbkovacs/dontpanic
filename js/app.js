/* /js/app.js */
document.addEventListener('DOMContentLoaded', () => {
    // --- DATA ---
    const binderData = [
        { 
            id: 'tab-1', 
            title: 'Procedures', 
            files: [
                { name: 'Startup Procedure', version: 'v1.2', date: '2025-09-23', path: 'files/startup-proc.pdf' },
                { name: 'Shutdown Procedure', version: 'v1.1', date: '2025-09-21', path: 'files/shutdown-proc.pdf' }
            ] 
        },
        { 
            id: 'tab-2', 
            title: 'Checklists', 
            files: [
                { name: 'Pre-Flight Checklist', version: 'v2.0', date: '2025-09-24', path: 'files/preflight.pdf' }
            ] 
        },
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
            sidebarHTML += `<a href="#" class="tab ${isActive}" data-tab-target="#${tab.id}-content">${tab.title}</a>`;
            
            let fileListHTML = '<p>No files in this section.</p>';
            if (tab.files.length > 0) {
                fileListHTML = tab.files.map(file => `
                    <div class="file-item" data-path="${file.path}" data-name="${file.name}">
                        <span class="file-name">${file.name}</span>
                        <span class="file-meta">Version: ${file.version} | Updated: ${file.date}</span>
                    </div>
                `).join('');
            }

            contentHTML += `
                <div class="content-panel ${isActive}" id="${tab.id}-content">
                    <h2>${tab.title}</h2>
                    <div class="file-list">${fileListHTML}</div>
                </div>
            `;
        });
        
        sidebar.innerHTML = sidebarHTML;
        contentArea.innerHTML = contentHTML;
    }

    function renderPdf(url, canvas) {
        const loadingTask = pdfjsLib.getDocument(url);
        loadingTask.promise.then(pdf => {
            return pdf.getPage(1);
        }).then(page => {
            // --- THIS IS THE UPDATED LOGIC ---
            // 1. Get the container and its width
            const container = document.querySelector('.modal-body');
            // Subtract padding to get the usable width
            const containerWidth = container.clientWidth - (parseFloat(getComputedStyle(container).paddingLeft) * 2);

            // 2. Calculate the scale required to fit the page width to the container width
            const viewportAtScale1 = page.getViewport({ scale: 1 });
            const scale = containerWidth / viewportAtScale1.width;
            const viewport = page.getViewport({ scale });
            // --- END OF UPDATED LOGIC ---

            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            page.render(renderContext);
        }).catch(err => {
            console.error('Error rendering PDF:', err);
            const context = canvas.getContext('2d');
            context.clearRect(0, 0, canvas.width, canvas.height);
            alert(`Could not load PDF. Make sure you are running a local server and the file exists at: ${url}`);
        });
    }

    // --- EVENT LISTENERS ---
    function initializeEventListeners() {
        document.querySelector('.sidebar').addEventListener('click', handleTabClick);
        document.querySelector('.content-area').addEventListener('click', handleFileClick);
        document.getElementById('modal-close-btn').addEventListener('click', closeModal);
        document.getElementById('pdf-modal').addEventListener('click', (e) => {
            if (e.target.id === 'pdf-modal') {
                closeModal();
            }
        });
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

    function handleFileClick(e) {
        const fileItem = e.target.closest('.file-item');
        if (!fileItem) return;
        
        const filePath = fileItem.dataset.path;
        const fileName = fileItem.dataset.name;
        
        openModal(fileName, filePath);
    }
    
    function openModal(fileName, pdfUrl) {
        const modal = document.getElementById('pdf-modal');
        const titleEl = document.getElementById('pdf-title');
        const canvas = document.getElementById('pdf-canvas');
        
        titleEl.textContent = fileName;
        modal.classList.remove('hidden');
        renderPdf(pdfUrl, canvas);
    }

    function closeModal() {
        const modal = document.getElementById('pdf-modal');
        modal.classList.add('hidden');
        const canvas = document.getElementById('pdf-canvas');
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
    }

    // --- UTILITIES ---
    function setBuildTimestamp() {
        const timestampElement = document.getElementById('build-timestamp');
        if (timestampElement) {
            const now = new Date();
            timestampElement.textContent = `Build: ${now.toLocaleString()}`;
        }
    }

    // --- START APP ---
    initializeApp();
});
/* Build Timestamp: Wed, 24 Sep 2025 17:13:11 GMT */