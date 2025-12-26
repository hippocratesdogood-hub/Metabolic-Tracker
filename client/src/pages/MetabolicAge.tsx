import React from 'react';

export default function MetabolicAge() {
  return (
    <div 
      className="-mx-4 -mt-4 md:-mx-8 md:-mt-8" 
      style={{ height: 'calc(100vh - 7rem)', minHeight: '500px' }}
      data-testid="page-metabolic-age"
    >
      <iframe
        src="https://met-age.replit.app/"
        className="w-full h-full border-0 rounded-none"
        title="Metabolic Age Calculator"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
        loading="lazy"
        data-testid="iframe-metabolic-age"
      />
    </div>
  );
}
