import { isFirebaseConfigured } from './firebase.js';
import { useAuth } from './hooks/useAuth.js';
import LoginScreen from './components/LoginScreen.jsx';
import Workspace from './components/Workspace.jsx';
import UpdateSnackbar from './components/UpdateSnackbar.jsx';

export default function App() {
  return (
    <>
      <Main />
      <UpdateSnackbar />
    </>
  );
}

function Main() {
  const user = useAuth();

  if (!isFirebaseConfigured) {
    return (
      <div className="center-screen">
        <p>Chưa cấu hình Firebase. Hãy điền config vào <code>src/firebaseConfig.js</code>.</p>
      </div>
    );
  }
  // Đang đọc phiên đăng nhập từ IndexedDB: chưa vẽ gì để tránh chớp màn hình đăng nhập
  if (user === undefined) return null;
  if (!user) return <LoginScreen />;
  return <Workspace key={user.uid} user={user} />;
}
