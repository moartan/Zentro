import { Route, Routes } from 'react-router-dom';
import PpanelProvider from '../context/PpanelProvider';
import PpanelUiProvider from '../context/PpanelUiProvider';
import Layout from '../components/Layout';
import LoginPage from '../pages/auth/login';
import SignupPage from '../pages/auth/signup';
import ForgotPasswordPage from '../pages/auth/forgot-password';
import ContactSalesPage from '../pages/contact-sales/ContactSales';
import DocsPage from '../pages/docs/Docs';
import HomePage from '../pages/home/Home';
import InvitationPage from '../pages/invitation/Invitation';
import FeaturesPage from '../pages/features/Features';
import PpanelNotFoundPage from '../pages/notfound/NotFound';
import PricingPage from '../pages/pricing/Pricing';
import GuestRoute from '../../shared/auth/GuestRoute';
import ProtectedRoute from '../../shared/auth/ProtectedRoute';
import CreateWorkspacePage from '../pages/workspace/create';

export default function PpanelRoutes() {
  return (
    <PpanelProvider>
      <PpanelUiProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/contact-sales" element={<ContactSalesPage />} />
          <Route path="/invitation" element={<InvitationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/workspace/create" element={<CreateWorkspacePage />} />
          </Route>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="*" element={<PpanelNotFoundPage />} />
        </Route>
        </Routes>
      </PpanelUiProvider>
    </PpanelProvider>
  );
}
