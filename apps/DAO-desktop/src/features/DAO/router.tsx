import { Navigate, Route, Routes } from 'react-router-dom'

import { DAOShell } from './shell/DAOShell'
import { ChatScreen } from './screens/ChatScreen'
import { CommandScreen } from './screens/CommandScreen'
import { DriveScreen } from './screens/DriveScreen'
import { HomeScreen } from './screens/HomeScreen'
import { InboxScreen } from './screens/InboxScreen'
import { SettingsScreen } from './screens/SettingsScreen'

/** Nested routes mounted at `/space/*` in the desktop HashRouter. */
export function DAOSpaceRoutes() {
  return (
    <Routes>
      <Route element={<DAOShell />} path=":slug">
        <Route element={<HomeScreen />} index />
        <Route element={<ChatScreen />} path="chat" />
        <Route element={<CommandScreen />} path="command" />
        <Route element={<DriveScreen />} path="drive" />
        <Route element={<InboxScreen />} path="inbox" />
        <Route element={<SettingsScreen />} path="settings" />
        <Route element={<Navigate replace to="." />} path="*" />
      </Route>
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  )
}

export { DAOSpaceRoutes as default }
