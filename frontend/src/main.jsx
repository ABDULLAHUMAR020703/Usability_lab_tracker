import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider, MetaProvider } from './hooks/hooks';
import { ConfirmProvider } from './components/ui';
import './styles/app.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider><ConfirmProvider><MetaProvider><App /></MetaProvider></ConfirmProvider></ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
