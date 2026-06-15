import { AuthGate, AuthProvider } from '@/features/auth'
import { DAOAppRoutes } from '@/features/DAO'
import { DAOGatewayKeepalive } from '@/features/DAO/gateway/DAOGatewayKeepalive'
import { SessionStreamBridge } from '@/features/DAO/gateway/SessionStreamBridge'

export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <DAOGatewayKeepalive />
        <SessionStreamBridge />
        <DAOAppRoutes />
      </AuthGate>
    </AuthProvider>
  )
}
