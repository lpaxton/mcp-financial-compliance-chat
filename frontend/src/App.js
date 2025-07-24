import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [userType, setUserType] = useState('retail_investor');
  const [finraRegistered, setFinraRegistered] = useState(false);
  const [secRegistered, setSecRegistered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Connect to the backend server
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      addMessage('system', 'Connected to MCP Financial Compliance Chat');
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
      addMessage('system', 'Disconnected from server');
    });

    newSocket.on('compliance_status', (data) => {
      console.log('Compliance status:', data);
      setComplianceStatus(data);
    });

    newSocket.on('message_response', (data) => {
      console.log('Message response:', data);
      setIsLoading(false);
      addMessage('assistant', data.response, data.complianceMetadata);
    });

    newSocket.on('processing_error', (data) => {
      console.log('Processing error:', data);
      setIsLoading(false);
      addMessage('error', `Error: ${data.error}`, data);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const addMessage = (type, content, metadata = null) => {
    const newMessage = {
      id: Date.now(),
      type,
      content,
      metadata,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const sendMessage = () => {
    if (!inputMessage.trim() || !socket || !connected || isLoading) {
      return;
    }

    const messageData = {
      messageId: Date.now(),
      message: inputMessage.trim(),
      userType,
      finraRegistered,
      secRegistered
    };

    addMessage('user', inputMessage.trim());
    setInputMessage('');
    setIsLoading(true);

    socket.emit('send_message', messageData);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getStatusColor = () => {
    return connected ? 'status-connected' : 'status-disconnected';
  };

  const formatComplianceStatus = () => {
    if (!complianceStatus) return 'Loading...';
    
    const { mcpServers, initialized, placeholderMode } = complianceStatus;
    
    return (
      <div>
        <strong>MCP Status:</strong> {initialized ? 'Initialized' : 'Not Initialized'} 
        {placeholderMode && ' (Placeholder Mode)'}
        <br />
        <strong>Servers:</strong>
        <ul>
          {Object.entries(mcpServers || {}).map(([name, status]) => (
            <li key={name}>
              {name}: {status.connected ? '✅ Connected' : '❌ Disconnected'}
              {status.error && ` (${status.error})`}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>MCP Financial Compliance Chat</h1>
        <div>
          <span className={`status-indicator ${getStatusColor()}`}></span>
          Status: {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <div className="user-controls">
        <label>
          User Type:
          <select value={userType} onChange={(e) => setUserType(e.target.value)}>
            <option value="retail_investor">Retail Investor</option>
            <option value="financial_advisor">Financial Advisor</option>
            <option value="institutional_investor">Institutional Investor</option>
          </select>
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={finraRegistered}
            onChange={(e) => setFinraRegistered(e.target.checked)}
          />
          FINRA Registered
        </label>
        
        <label>
          <input
            type="checkbox"
            checked={secRegistered}
            onChange={(e) => setSecRegistered(e.target.checked)}
          />
          SEC Registered
        </label>
      </div>

      <div className="compliance-status">
        <h3>Compliance Status</h3>
        {formatComplianceStatus()}
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              <strong>{message.type}:</strong> {message.content}
              {message.metadata && (
                <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  <details>
                    <summary>Metadata</summary>
                    <pre>{JSON.stringify(message.metadata, null, 2)}</pre>
                  </details>
                </div>
              )}
              <div style={{ fontSize: '10px', color: '#999' }}>
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <strong>assistant:</strong> Processing your message...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a financial compliance question..."
            disabled={!connected || isLoading}
          />
          <button 
            onClick={sendMessage}
            disabled={!connected || !inputMessage.trim() || isLoading}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;