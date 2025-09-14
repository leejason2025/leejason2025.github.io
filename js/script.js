// script.js - Updated for new semantic navigation structure

// Function to handle tab switching
function openTab(event, tabName) {
  // Prevent default behavior
  event.preventDefault();
  
  // Get all tab content and nav buttons
  const tabContents = document.querySelectorAll('.tab-content');
  const navButtons = document.querySelectorAll('.nav-button');
  
  // Hide all tab contents
  tabContents.forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active class from all nav buttons and update aria-selected
  navButtons.forEach(button => {
    button.classList.remove('active');
    button.setAttribute('aria-selected', 'false');
  });
  
  // Show the selected tab content
  const targetTab = document.getElementById(tabName);
  if (targetTab) {
    targetTab.classList.add('active');
  }
  
  // Add active class to clicked button and update aria-selected
  event.target.classList.add('active');
  event.target.setAttribute('aria-selected', 'true');
}

// Enhanced navigation with keyboard support
document.addEventListener("DOMContentLoaded", () => {
  const navButtons = document.querySelectorAll(".nav-button");
  const sections = document.querySelectorAll(".tab-content");

  // Add keyboard navigation support
  navButtons.forEach((button, index) => {
    button.addEventListener("keydown", (e) => {
      let targetIndex = index;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          targetIndex = index > 0 ? index - 1 : navButtons.length - 1;
          break;
        case 'ArrowRight':
          e.preventDefault();
          targetIndex = index < navButtons.length - 1 ? index + 1 : 0;
          break;
        case 'Home':
          e.preventDefault();
          targetIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          targetIndex = navButtons.length - 1;
          break;
        default:
          return;
      }
      
      navButtons[targetIndex].focus();
      navButtons[targetIndex].click();
    });
  });
  
  // Ensure proper initial state
  const activeButton = document.querySelector('.nav-button.active');
  const activeSection = document.querySelector('.tab-content.active');
  
  if (activeButton && activeSection) {
    activeButton.setAttribute('aria-selected', 'true');
  }
});
