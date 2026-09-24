import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { HomePage } from '../pages/HomePage';
import { EmployeeDirectoryPage } from '../pages/EmployeeDirectoryPage';
import { EmployeeProfilePage } from '../pages/EmployeeProfilePage';
import { DeviceManagementPage } from '../pages/DeviceManagementPage';
import { ActivityDashboardPage } from '../pages/ActivityDashboardPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<HomePage />} />
        <Route path="employees" element={<EmployeeDirectoryPage />} />
        <Route path="employees/:id" element={<EmployeeProfilePage />} />
        <Route path="devices" element={<DeviceManagementPage />} />
        <Route path="activity" element={<ActivityDashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};
