import { AdminConsole } from '@/components/admin/admin-console'

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold">Operations</h1>
      <AdminConsole />
    </div>
  )
}
