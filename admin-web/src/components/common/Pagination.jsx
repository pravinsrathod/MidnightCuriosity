import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Reusable Pagination component for the Admin Portal.
 * 
 * @param {number} currentPage - The current active page (1-indexed).
 * @param {number} totalItems - Total number of items in the dataset.
 * @param {number} pageSize - Number of items per page.
 * @param {function} onPageChange - Callback function when a page is changed.
 */
const Pagination = ({ currentPage, totalItems, pageSize, onPageChange }) => {
  const totalPages = Math.ceil(totalItems / pageSize);

  if (totalPages <= 1) return null;

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // Logic for ellipsis
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <div className="pagination-container animate-fade-in" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      marginTop: '24px',
      padding: '12px',
    }}>
      <button
        className="btn btn-ghost"
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
        style={{
          padding: '8px',
          borderRadius: '10px',
          opacity: currentPage === 1 ? 0.3 : 1,
          cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
        }}
      >
        <ChevronLeft size={18} />
      </button>

      {getPageNumbers().map((page, index) => (
        <button
          key={index}
          className={`btn ${currentPage === page ? 'btn-primary' : 'btn-ghost'}`}
          disabled={page === '...'}
          onClick={() => typeof page === 'number' && onPageChange(page)}
          style={{
            minWidth: '36px',
            height: '36px',
            padding: '0',
            borderRadius: '10px',
            background: currentPage === page ? 'var(--accent-gradient)' : 'transparent',
            border: currentPage === page ? 'none' : '1px solid var(--border)',
            color: currentPage === page ? 'white' : 'var(--text-secondary)',
            fontSize: '0.85rem',
            fontWeight: currentPage === page ? 700 : 400,
          }}
        >
          {page}
        </button>
      ))}

      <button
        className="btn btn-ghost"
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        style={{
          padding: '8px',
          borderRadius: '10px',
          opacity: currentPage === totalPages ? 0.3 : 1,
          cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
        }}
      >
        <ChevronRight size={18} />
      </button>

      <div style={{ marginLeft: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)}-{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
      </div>
    </div>
  );
};

export default Pagination;
