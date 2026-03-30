import { Navigate, Route, Routes } from 'react-router-dom';
import CpanelProvider from '../context/CpanelProvider';
import CpanelUiProvider from '../context/CpanelUiProvider';
import Layout from '../components/Layout';
import DashboardPage from '../pages/dashboard/dashboard';
import CpanelNotFoundPage from '../pages/notfound/NotFound';
import ProtectedRoute from '../../shared/auth/ProtectedRoute';
import RoleRoute from '../../shared/auth/RoleRoute';
import WorkspaceRequiredRoute from '../../shared/auth/WorkspaceRequiredRoute';
import ProfilePage from '../pages/profile/profile';
import ProfileOverviewPage from '../pages/profile/Overview';
import EditProfilePage from '../pages/profile/EditProfile';
import AvatarUploadPage from '../pages/profile/AvatarUpload';
import SecurityPage from '../pages/profile/Security';
import EmailVerificationPage from '../pages/profile/EmailVerification';
import SessionsLogsPage from '../pages/profile/SessionsLogs';
import SectionPage from '../pages/shared/SectionPage';
import UsersPage from '../pages/users/Users';
import InviteMemberPage from '../pages/members/InviteMember';
import UserDetailsPage from '../pages/users/UserDetails';
import UserDetailsAccountTab from '../pages/users/components/Account';
import UserDetailsWorkspaceTab from '../pages/users/components/Workspace';
import UserDetailsPermissionsTab from '../pages/users/components/Permissions';
import UserDetailsTasksTab from '../pages/users/components/Tasks';
import UserDetailsActivityTab from '../pages/users/components/Activity';
import UserDetailsBillingTab from '../pages/users/components/Billing';
import MembersPage from '../pages/members/Members';
import MemberDetailsPage from '../pages/members/MemberDetails';
import MemberDetailsAccountTab from '../pages/members/components/Account';
import MemberDetailsWorkspaceTab from '../pages/members/components/Workspace';
import MemberDetailsPermissionsTab from '../pages/members/components/Permissions';
import MemberDetailsTasksTab from '../pages/members/components/Tasks';
import MemberDetailsActivityTab from '../pages/members/components/Activity';
import TeamsPage from '../pages/teams/Teams';
import MyTeamsPage from '../pages/teams/MyTeams';
import TasksListPage from '../pages/tasks/TasksList';
import MyTasksPage from '../pages/tasks/MyTasks';
import TeamTasksPage from '../pages/tasks/TeamTasks';
import TaskDetailsPage from '../pages/tasks/TaskDetails';
import TaskTabTasks from '../pages/tasks/components/TaskTabTasks';
import TaskTabComments from '../pages/tasks/components/TaskTabComments';
import TaskTabFiles from '../pages/tasks/components/TaskTabFiles';
import TaskTabActivity from '../pages/tasks/components/TaskTabActivity';
import MySubscriptionPage from '../pages/subscriptions/MySubscription';
import SubscriptionPlansPage from '../pages/subscriptions/SubscriptionPlans';
import SubscriptionBusinessesPage from '../pages/subscriptions/SubscriptionBusinesses';
import WorkspaceEditorPage from '../pages/workspace/WorkspaceEditor';
import WorkspacesPage from '../pages/workspace/Workspaces';
import WorkspaceDetailsPage from '../pages/workspace/WorkspaceDetails';
import WorkspaceOverviewTab from '../pages/workspace/components/Overview';
import WorkspaceMembersTab from '../pages/workspace/components/Members';
import WorkspaceTeamsTab from '../pages/workspace/components/Teams';
import WorkspaceSubscriptionTab from '../pages/workspace/components/Subscription';
import WorkspaceActivityTab from '../pages/workspace/components/Activity';

export default function CpanelRoutes() {
  return (
    <CpanelProvider>
      <CpanelUiProvider>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route element={<WorkspaceRequiredRoute />}>
              <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />

              <Route element={<RoleRoute allowedRoles={['super_admin']} />}>
                <Route path="/users" element={<UsersPage />} />
                <Route path="/users/:id" element={<UserDetailsPage />}>
                  <Route index element={<Navigate to="account" replace />} />
                  <Route path="account" element={<UserDetailsAccountTab />} />
                  <Route path="workspace" element={<UserDetailsWorkspaceTab />} />
                  <Route path="permissions" element={<UserDetailsPermissionsTab />} />
                  <Route path="tasks" element={<UserDetailsTasksTab />} />
                  <Route path="activity" element={<UserDetailsActivityTab />} />
                  <Route path="billing" element={<UserDetailsBillingTab />} />
                </Route>
                <Route path="/workspaces" element={<WorkspacesPage />} />
                <Route path="/workspaces/:slug" element={<WorkspaceDetailsPage />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<WorkspaceOverviewTab />} />
                  <Route path="members" element={<WorkspaceMembersTab />} />
                  <Route path="teams" element={<WorkspaceTeamsTab />} />
                  <Route path="subscription" element={<WorkspaceSubscriptionTab />} />
                  <Route path="activity" element={<WorkspaceActivityTab />} />
                </Route>
                <Route path="/subscriptions/plans" element={<SubscriptionPlansPage />} />
                <Route path="/subscriptions/businesses" element={<SubscriptionBusinessesPage />} />
                <Route path="/settings" element={<SectionPage title="Settings" description="Platform-level settings." />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['business_owner']} />}>
                <Route path="/workspace" element={<WorkspaceEditorPage />} />
                <Route path="/members" element={<MembersPage />} />
                <Route path="/members/invite" element={<InviteMemberPage />} />
                <Route path="/members/:id" element={<MemberDetailsPage />}>
                  <Route index element={<Navigate to="account" replace />} />
                  <Route path="account" element={<MemberDetailsAccountTab />} />
                  <Route path="workspace" element={<MemberDetailsWorkspaceTab />} />
                  <Route path="permissions" element={<MemberDetailsPermissionsTab />} />
                  <Route path="tasks" element={<MemberDetailsTasksTab />} />
                  <Route path="activity" element={<MemberDetailsActivityTab />} />
                </Route>
                <Route path="/my-subscription" element={<MySubscriptionPage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/tasks/team" element={<TeamTasksPage />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['super_admin', 'business_owner']} />}>
                <Route path="/tasks" element={<TasksListPage />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['business_owner', 'employee']} />}>
                <Route path="/tasks/my" element={<MyTasksPage />} />
              </Route>

              <Route element={<RoleRoute allowedRoles={['super_admin', 'business_owner', 'employee']} />}>
                <Route path="/tasks/:taskId" element={<TaskDetailsPage />}>
                  <Route index element={<Navigate to="tasks" replace />} />
                  <Route path="tasks" element={<TaskTabTasks />} />
                  <Route path="comments" element={<TaskTabComments />} />
                  <Route path="files" element={<TaskTabFiles />} />
                  <Route path="activity" element={<TaskTabActivity />} />
                </Route>
              </Route>

              <Route element={<RoleRoute allowedRoles={['employee']} />}>
                <Route path="/my-teams" element={<MyTeamsPage />} />
              </Route>

              <Route path="/profile" element={<ProfilePage />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<ProfileOverviewPage />} />
                <Route path="edit-profile" element={<EditProfilePage />} />
                <Route path="avatar-upload" element={<AvatarUploadPage />} />
                <Route path="security" element={<SecurityPage />} />
                <Route path="email-verification" element={<EmailVerificationPage />} />
                <Route path="sessions-logs" element={<SessionsLogsPage />} />
              </Route>

              <Route path="*" element={<CpanelNotFoundPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </CpanelUiProvider>
    </CpanelProvider>
  );
}
