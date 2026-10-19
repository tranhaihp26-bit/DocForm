import React, { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[DocForm 30 ErrorBoundary] Bắt được lỗi giao diện:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetState = () => {
    try {
      sessionStorage.clear();
    } catch {
      // Bỏ qua lỗi truy cập storage
    }
    window.location.reload();
  };

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-5 shadow-xs">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <h1 className="text-xl font-bold text-slate-800 mb-2">
              Đã xảy ra sự cố hiển thị trong phiên làm việc
            </h1>

            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              DocForm 30 đã phát hiện một lỗi kết xuất không mong muốn. Để tiếp tục làm việc và tránh mất dữ liệu, bạn có thể thử tải lại trang hoặc khôi phục về trạng thái an toàn ban đầu.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
              <button
                onClick={this.handleReload}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-lg flex items-center justify-center gap-2 shadow-xs transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải lại trang</span>
              </button>

              <button
                onClick={this.handleResetState}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-lg flex items-center justify-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Khôi phục về mặc định</span>
              </button>

              <button
                onClick={this.handleTryAgain}
                className="w-full sm:w-auto px-4 py-2.5 text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Thử lại phiên này
              </button>
            </div>

            {this.state.error && (
              <details className="text-left bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-700 font-mono overflow-auto max-h-48">
                <summary className="cursor-pointer text-slate-500 font-sans font-semibold mb-1">
                  Chi tiết lỗi kỹ thuật (dành cho lập trình viên)
                </summary>
                <div className="text-rose-600 font-semibold mb-1">
                  {this.state.error.toString()}
                </div>
                {this.state.errorInfo && (
                  <pre className="whitespace-pre-wrap text-[11px] text-slate-500">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
