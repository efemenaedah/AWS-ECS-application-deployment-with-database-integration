// The ALB routes /api/* requests to the backend ECS service.
const API_URL = "/api/applications";

// State management
let applications = [];
let isLoading = false;

// Carousel state
let currentSlide = 0;
let cardsPerView = 1;
let totalSlides = 0;

// Filter state
let currentFilter = 'all';

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    updateCardsPerView();
    window.addEventListener('resize', updateCardsPerView);
});

function updateCardsPerView() {
    const screenWidth = window.innerWidth;
    if (screenWidth >= 1200) {
        cardsPerView = 3;
    } else if (screenWidth >= 768) {
        cardsPerView = 2;
    } else {
        cardsPerView = 1;
    }
    updateCarouselButtons();
}

function initializeApp() {
    setupEventListeners();
    fetchApplications();
}

function setupEventListeners() {
    const form = document.getElementById('applicationForm');
    form.addEventListener('submit', handleFormSubmit);

    // Set default date to today
    const dateInput = document.getElementById('dateApplied');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Setup touch events for carousel
    setupTouchEvents();
}

// Toggle custom status input
function toggleCustomStatus() {
    const statusSelect = document.getElementById('status');
    const customStatusInput = document.getElementById('customStatus');
    
    if (statusSelect.value === 'Other') {
        customStatusInput.style.display = 'block';
        customStatusInput.required = true;
    } else {
        customStatusInput.style.display = 'none';
        customStatusInput.required = false;
        customStatusInput.value = '';
    }
}

// Toggle custom source input
function toggleCustomSource() {
    const sourceSelect = document.getElementById('applicationSource');
    const customSourceInput = document.getElementById('customSource');
    
    if (sourceSelect.value === 'Other') {
        customSourceInput.style.display = 'block';
        customSourceInput.required = true;
    } else {
        customSourceInput.style.display = 'none';
        customSourceInput.required = false;
        customSourceInput.value = '';
    }
}

// Filter applications
function filterApplications(status, buttonElement) {
    currentFilter = status;
    
    // Update filter button states
    document.querySelectorAll('.btn-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    if (buttonElement) {
        buttonElement.classList.add('active');
    }

    // Filter and render applications
    const filteredApps = status === 'all' ? applications : applications.filter(app => (app.applicationStatus || app.status) === status);
    renderFilteredApplications(filteredApps);
}

function renderFilteredApplications(filteredApps) {
    const container = document.getElementById('carouselTrack');
    
    if (!filteredApps || filteredApps.length === 0) {
        container.innerHTML = `
            <div class="filter-empty-state">
                <h3>No applications found</h3>
                <p>No applications match the current filter.</p>
            </div>
        `;
        totalSlides = 0;
        currentSlide = 0;
        updateCarouselDots();
        updateCarouselButtons();
        return;
    }

    container.innerHTML = filteredApps.map(app => createApplicationCard(app)).join('');
    
    // Update carousel state
    totalSlides = Math.max(0, filteredApps.length - cardsPerView + 1);
    currentSlide = Math.min(currentSlide, totalSlides - 1);
    if (currentSlide < 0) currentSlide = 0;
    
    updateCarouselDots();
    updateCarouselButtons();
    scrollToSlide(currentSlide);
}

// Fetch all applications with error handling
async function fetchApplications() {
    if (isLoading) return;
    
    setLoadingState(true);
    hideAllStates();
    showElement('loadingState');
    
    try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        applications = data || [];
        
        renderApplications();
        updateApplicationsCount();
        
        if (applications.length === 0) {
            showElement('emptyState');
        }
    } catch (error) {
        console.error('Error fetching applications:', error);
        showElement('errorState');
        showToast('Failed to load applications. Please check your connection.', 'error');
    } finally {
        setLoadingState(false);
        hideElement('loadingState');
    }
}

// Handle form submission
async function handleFormSubmit(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const application = Object.fromEntries(formData.entries());
    
    // Map form fields to match your DynamoDB structure
    const mappedApplication = {
        CompanyName: application.companyName,
        jobTitle: application.role,
        applicationSource: application.applicationSource === 'Other' ? application.customSource : application.applicationSource || 'Direct Application',
        applicationStatus: application.status === 'Other' ? application.customStatus : application.status,
        dateApplied: application.dateApplied || new Date().toISOString().split('T')[0],
        location: application.location,
        salaryRange: application.salaryRange,
        actionToTake: application.actionToTake || 'Follow up in 1 week',
        notes: application.notes
    };
    
    // Validate required fields
    if (!mappedApplication.CompanyName.trim() || !mappedApplication.jobTitle.trim()) {
        showToast('Please fill in all required fields.', 'error');
        return;
    }
    
    await addApplication(mappedApplication);
}

// Add a new application with error handling
async function addApplication(applicationData) {
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoading = submitBtn.querySelector('.btn-loading');
    
    // Show loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline';
    
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify(applicationData)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const newApplication = await response.json();
        
        // Add to local state for immediate UI update
        applications.unshift(newApplication);
        
        // Reset form and update UI
        document.getElementById('applicationForm').reset();
        renderApplications();
        updateApplicationsCount();
        hideElement('emptyState');
        
        showToast('Application added successfully!', 'success');
    } catch (error) {
        console.error('Error adding application:', error);
        showToast('Failed to add application. Please try again.', 'error');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

// Render applications in a carousel layout
function renderApplications() {
    const container = document.getElementById('carouselTrack');
    
    if (!applications || applications.length === 0) {
        container.innerHTML = '';
        updateCarouselDots();
        updateCarouselButtons();
        return;
    }

    // Apply current filter
    const filteredApps = currentFilter === 'all' ? applications : applications.filter(app => (app.applicationStatus || app.status) === currentFilter);
    renderFilteredApplications(filteredApps);
}

// Create individual application card
function createApplicationCard(app) {
    const createdDate = app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'Unknown';
    const appliedDate = app.dateApplied ? new Date(app.dateApplied).toLocaleDateString() : createdDate;
    const statusClass = getStatusClass(app.applicationStatus || app.status);
    const companyName = app.CompanyName || app.companyName || 'Unknown Company';
    const jobTitle = app.jobTitle || app.role || 'Unknown Role';
    const status = app.applicationStatus || app.status || 'Applied';
    
    return `
        <div class="application-card" onclick="toggleCardExpansion(this)">
            <div class="card-header">
                <div class="company-info">
                    <h3 class="company-name">${escapeHtml(companyName)}</h3>
                    <p class="role-title">${escapeHtml(jobTitle)}</p>
                </div>
                <span class="status-badge ${statusClass}">${escapeHtml(status)}</span>
            </div>
            <div class="card-body">
                <div class="card-quick-info">
                    <div class="info-item">
                        <span class="info-label">Location:</span>
                        <span class="info-text">${escapeHtml(app.location || 'Not specified')}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Applied:</span>
                        <span class="info-text">${appliedDate}</span>
                    </div>
                    ${app.salaryRange ? `
                        <div class="info-item">
                            <span class="info-label">Salary:</span>
                            <span class="info-text">${escapeHtml(app.salaryRange)}</span>
                        </div>
                    ` : ''}
                    ${app.applicationSource ? `
                        <div class="info-item">
                            <span class="info-label">Source:</span>
                            <span class="info-text">${escapeHtml(app.applicationSource)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="card-expanded-content">
                    ${app.actionToTake ? `
                        <div class="detail-section">
                            <h4>Next Action</h4>
                            <p class="action-text">${escapeHtml(app.actionToTake)}</p>
                        </div>
                    ` : ''}
                    ${app.notes ? `
                        <div class="detail-section">
                            <h4>Notes</h4>
                            <p class="notes-text">${escapeHtml(app.notes)}</p>
                        </div>
                    ` : ''}
                    <div class="card-actions">
                        <button class="btn btn-small btn-outline" onclick="event.stopPropagation(); editApplication('${app.applicationId}')">Edit</button>
                        <button class="btn btn-small btn-danger" onclick="event.stopPropagation(); deleteApplication('${app.applicationId}')">Delete</button>
                    </div>
                </div>
                <div class="expand-indicator">
                    <span class="expand-text">Click to expand</span>
                    <span class="expand-arrow">▼</span>
                </div>
            </div>
        </div>
    `;
}

// Toggle card expansion
function toggleCardExpansion(card) {
    card.classList.toggle('expanded');
}

// Placeholder functions for edit/delete
function editApplication(applicationId) {
    showToast('Edit functionality coming soon!', 'info');
}

function deleteApplication(applicationId) {
    if (confirm('Are you sure you want to delete this application?')) {
        applications = applications.filter(app => app.applicationId !== applicationId);
        renderApplications();
        updateApplicationsCount();
        showToast('Application deleted successfully!', 'success');
    }
}

// Get CSS class for status badge
function getStatusClass(status) {
    const statusMap = {
        'Applied': 'status-applied',
        'Interview Scheduled': 'status-interview',
        'Interview Completed': 'status-interview-completed',
        'Awaiting Offer': 'status-awaiting',
        'Offer Received': 'status-offer',
        'Hired': 'status-hired',
        'Rejected': 'status-rejected',
        'Ghosted': 'status-ghosted',
        'Withdrawn': 'status-withdrawn'
    };
    
    // For custom statuses, use a default class
    return statusMap[status] || 'status-custom';
}

// Update applications count
function updateApplicationsCount() {
    const countElement = document.getElementById('applicationsCount');
    countElement.textContent = applications.length;
}

// Utility functions
function setLoadingState(loading) {
    isLoading = loading;
}

function hideAllStates() {
    hideElement('loadingState');
    hideElement('emptyState');
    hideElement('errorState');
}

function showElement(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = 'block';
}

function hideElement(id) {
    const element = document.getElementById(id);
    if (element) element.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toast notification system
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} toast-show`;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// Carousel navigation functions
function scrollCarousel(direction) {
    const newSlide = currentSlide + direction;
    
    if (newSlide >= 0 && newSlide < totalSlides) {
        currentSlide = newSlide;
        scrollToSlide(currentSlide);
        updateCarouselButtons();
        updateCarouselDots();
    }
}

function scrollToSlide(slideIndex) {
    const track = document.getElementById('carouselTrack');
    const cardWidth = 350 + 32; // card width + gap
    const scrollPosition = slideIndex * cardWidth;
    
    track.scrollTo({
        left: scrollPosition,
        behavior: 'smooth'
    });
}

function updateCarouselButtons() {
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (prevBtn && nextBtn) {
        prevBtn.disabled = currentSlide <= 0;
        nextBtn.disabled = currentSlide >= totalSlides - 1 || totalSlides <= 1;
        
        // Hide buttons if no applications or only one slide
        const shouldHide = totalSlides <= 1;
        prevBtn.style.display = shouldHide ? 'none' : 'flex';
        nextBtn.style.display = shouldHide ? 'none' : 'flex';
    }
}

function updateCarouselDots() {
    const dotsContainer = document.getElementById('carouselDots');
    if (!dotsContainer) return;
    
    // Clear existing dots
    dotsContainer.innerHTML = '';
    
    // Don't show dots if there's only one slide or no slides
    if (totalSlides <= 1) {
        return;
    }
    
    // Create dots
    for (let i = 0; i < totalSlides; i++) {
        const dot = document.createElement('div');
        dot.className = `carousel-dot ${i === currentSlide ? 'active' : ''}`;
        dot.onclick = () => goToSlide(i);
        dotsContainer.appendChild(dot);
    }
}

function goToSlide(slideIndex) {
    if (slideIndex >= 0 && slideIndex < totalSlides) {
        currentSlide = slideIndex;
        scrollToSlide(currentSlide);
        updateCarouselButtons();
        updateCarouselDots();
    }
}

// Touch/swipe support for mobile
let touchStartX = 0;
let touchEndX = 0;

function setupTouchEvents() {
    const track = document.getElementById('carouselTrack');
    if (track) {
        track.addEventListener('touchstart', handleTouchStart, { passive: true });
        track.addEventListener('touchend', handleTouchEnd, { passive: true });
    }
}

function handleTouchStart(event) {
    touchStartX = event.changedTouches[0].screenX;
}

function handleTouchEnd(event) {
    touchEndX = event.changedTouches[0].screenX;
    handleSwipe();
}

function handleSwipe() {
    const swipeThreshold = 50;
    const swipeDistance = touchStartX - touchEndX;
    
    if (Math.abs(swipeDistance) > swipeThreshold) {
        if (swipeDistance > 0) {
            // Swipe left - go to next slide
            scrollCarousel(1);
        } else {
            // Swipe right - go to previous slide
            scrollCarousel(-1);
        }
    }
}
