// Clientes (= proyectos). A cada cliente se asocian llamadas, leads, ventas,
// reports y conversaciones del Orbe. Filtros de las secciones = por cliente.
export const CLIENTS = [
  { id: 'cl_hugo', name: 'En Forma con Hugo', sector: 'Fitness' },
  { id: 'cl_yc',   name: 'YC Logistics',      sector: 'Logística' },
  { id: 'cl_fba',  name: 'FBA Academy',       sector: 'E-commerce' },
]

export const CLIENT_CYCLE = CLIENTS.map(c => c.id)
export const CLIENT_OPTIONS = CLIENTS.map(c => ({ key: c.id, label: c.name }))
export const getClient = (id) => CLIENTS.find(c => c.id === id)
export const clientName = (id) => getClient(id)?.name || '—'
export const clientInitials = (id) => {
  const n = clientName(id)
  return n.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}
