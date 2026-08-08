// utils/accessibilityTree.js

import { isHardBlocked } from './domPruner.js';

let refIdCounter = 1;
const refMap = new Map(); // Maps refId -> HTMLElement

/**
 * Resets the element mapping for a new snapshot.
 */
export function resetRefMap() {
  refIdCounter = 1;
  refMap.clear();
}

/**
 * Returns the DOM element associated with a Ref ID.
 */
export function getElementByRefId(id) {
  return refMap.get(id);
}

/**
 * Builds a markdown-formatted accessibility tree from the DOM.
 * @param {HTMLElement} root The root element to start parsing from (usually document.body)
 * @returns {string} Markdown string of the DOM.
 */
export function buildAccessibilityTree(root) {
  resetRefMap();
  const result = [];
  
  function traverse(node, depth = 0) {
    // Skip non-element nodes, invisible nodes, or iframes (cross-origin)
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;
    
    // Prune hard-blocked fields
    if (isHardBlocked(node)) return;

    const tagName = node.tagName.toLowerCase();
    
    // Check if it's an interactive or structurally significant element
    const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(tagName) || node.getAttribute('role') === 'button';
    const isContainer = ['main', 'nav', 'header', 'footer', 'form', 'section', 'article'].includes(tagName);
    const hasText = node.childNodes.length === 1 && node.childNodes[0].nodeType === Node.TEXT_NODE && node.innerText.trim();

    if (isInteractive || isContainer || (hasText && ['h1','h2','h3','h4','h5','h6','p','span','div'].includes(tagName))) {
      const indent = '  '.repeat(depth);
      
      let line = `${indent}- ${tagName}`;
      
      // Assign Ref ID if interactive or if it's a structural element containing text that might be needed
      if (isInteractive) {
        const id = refIdCounter++;
        refMap.set(id, node);
        line += ` [id=${id}]`;
        
        // Add attributes
        if (tagName === 'input') {
          const type = node.type;
          line += ` type="${type}"`;
          if (node.value) line += ` (value: "${node.value}")`;
        }
        
        const label = node.getAttribute('aria-label') || node.innerText.trim().substring(0, 100);
        if (label && tagName !== 'input') {
          line += ` "${label.replace(/\n/g, ' ')}"`;
        }
      } else if (hasText) {
        line += ` "${node.innerText.trim().substring(0, 200).replace(/\n/g, ' ')}"`;
      }

      result.push(line);
      depth++; // Increase depth for children only if we logged this node
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child, depth);
    }
  }

  traverse(root);
  return result.join('\n');
}
