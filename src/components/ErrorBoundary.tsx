import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    (this as any).state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    const { children } = (this as any).props;
    if ((this as any).state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      let errorDetail = (this as any).state.error?.message || "";
      
      try {
        // Check if it's a Firestore error JSON
        const parsed = JSON.parse(errorDetail);
        if (parsed.error && parsed.operationType) {
          errorMessage = `Erro de permissão no banco de dados (${parsed.operationType}). Por favor, contate o suporte. [ERR-DB-001]`;
          errorDetail = parsed.error;
        }
      } catch (e) {
        // Not a JSON error
        errorMessage = `Erro interno do aplicativo. [ERR-APP-001]`;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-zinc-900">Ops! Algo deu errado</h2>
              <p className="text-zinc-500 text-sm">{errorMessage}</p>
              {errorDetail && (
                <p className="text-[10px] text-zinc-400 font-mono break-all opacity-50 mt-2">
                  Detalhe: {errorDetail.substring(0, 100)}
                </p>
              )}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
