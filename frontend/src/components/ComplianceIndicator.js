import React from 'react';

const ComplianceIndicator = ({ status, label }) => {
  const getStatusColor = () => {
    if (status === 'connected') return '#4caf50';
    if (status === 'error') return '#f44336';
    return '#ff9800';
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      margin: '5px 0',
      padding: '5px 10px',
      backgroundColor: '#f5f5f5',
      borderRadius: '4px',
      borderLeft: `4px solid ${getStatusColor()}`
    }}>
      <div 
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: getStatusColor(),
          marginRight: '8px'
        }}
      />
      <span style={{ fontSize: '14px', fontWeight: '500' }}>
        {label}: {status}
      </span>
    </div>
  );
};

export default ComplianceIndicator;