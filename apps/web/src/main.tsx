import { createRoot } from 'react-dom/client';
import { Component, type ReactNode } from 'react';
import '@fontsource-variable/cairo';
import App from './app/app';
import './styles/global.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="surface padded" role="alert">
        <h1>تعذّر تحميل الصفحة</h1>
        <button type="button" onClick={() => window.location.reload()}>إعادة المحاولة</button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(<AppErrorBoundary><App /></AppErrorBoundary>);
