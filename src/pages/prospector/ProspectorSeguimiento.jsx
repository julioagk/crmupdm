import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Phone,
    MessageSquare,
    Mail,
    Calendar,
    Search,
    RefreshCw,
    Plus,
    UserPlus,
    CheckCircle2,
    XCircle,
    Clock,
    ChevronRight,
    User,
    Star,
    ArrowLeft,
    Edit2,
    Filter,
    Bell
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getToken } from '../../utils/authUtils';
import HistorialInteracciones from '../../components/HistorialInteracciones';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const TIPOS_ACTIVIDAD = [
    { value: 'llamada', label: 'Llamada', icon: Phone, color: 'bg-blue-500' },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'bg-green-500' },
    { value: 'correo', label: 'Correo', icon: Mail, color: 'bg-purple-500' },
    { value: 'cita', label: 'Cita agendada', icon: Calendar, color: 'bg-teal-500' }
];

const RESULTADOS = [
    { value: 'exitoso', label: 'Exitoso', icon: CheckCircle2 },
    { value: 'pendiente', label: 'Pendiente', icon: Clock },
    { value: 'fallido', label: 'No contestó', icon: XCircle }
];

const getTipoLabel = (tipo) => TIPOS_ACTIVIDAD.find(t => t.value === tipo)?.label || tipo;
const getTipoColor = (tipo) => TIPOS_ACTIVIDAD.find(t => t.value === tipo)?.color || 'bg-gray-500';
const getResultadoLabel = (r) => RESULTADOS.find(x => x.value === r)?.label || r;

const ETAPAS_EMBUDO = {
    'prospecto_nuevo': { label: 'Sin contacto', color: 'bg-slate-100 text-slate-600' },
    'en_contacto': { label: 'En contacto', color: 'bg-blue-100 text-blue-600' },
    'reunion_agendada': { label: 'Cita agendada', color: 'bg-teal-100 text-teal-600' },
    'reunion_realizada': { label: 'Cita realizada', color: 'bg-indigo-100 text-indigo-600' },
    'en_negociacion': { label: 'Negociación', color: 'bg-amber-100 text-amber-600' },
    'venta_ganada': { label: 'Venta ganada', color: 'bg-emerald-100 text-emerald-600' },
    'perdido': { label: 'Perdido', color: 'bg-rose-100 text-rose-600' }
};

const getEtapaLabel = (etapa) => ETAPAS_EMBUDO[etapa]?.label || etapa;
const getEtapaColor = (etapa) => ETAPAS_EMBUDO[etapa]?.color || 'bg-gray-100 text-gray-600';

const ProspectorSeguimiento = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const rolePath = location.pathname.startsWith('/closer') ? 'closer' : 'prospector';
    const [prospectos, setProspectos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [usandoMock, setUsandoMock] = useState(false);
    const [busquedaProspecto, setBusquedaProspecto] = useState('');
    const [filtroEtapa, setFiltroEtapa] = useState('todos');
    const [filtroInteres, setFiltroInteres] = useState('todos');
    const [filtroRecordatorio, setFiltroRecordatorio] = useState(false);
    const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
    const [loadingCrear, setLoadingCrear] = useState(false);
    const [formCrear, setFormCrear] = useState({
        nombres: '',
        apellidoPaterno: '',
        apellidoMaterno: '',
        telefono: '',
        correo: '',
        empresa: '',
        notas: ''
    });

    // Estado para la edición de prospectos
    const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
    const [prospectoAEditar, setProspectoAEditar] = useState({});
    const [loadingEditar, setLoadingEditar] = useState(false);

    // Estados para modales de conversión y descarte
    const [modalPasarClienteAbierto, setModalPasarClienteAbierto] = useState(false);
    const [modalDescartarAbierto, setModalDescartarAbierto] = useState(false);
    const [notaConversion, setNotaConversion] = useState('');
    const [notaDescarte, setNotaDescarte] = useState('');
    const [loadingConversion, setLoadingConversion] = useState(false);

    const abrirModalEditar = (p) => {
        setProspectoAEditar({
            id: p._id || p.id,
            nombres: p.nombres || '',
            apellidoPaterno: p.apellidoPaterno || '',
            apellidoMaterno: p.apellidoMaterno || '',
            telefono: p.telefono || '',
            correo: p.correo || '',
            empresa: p.empresa || '',
            notas: p.notas || ''
        });
        setModalEditarAbierto(true);
    };

    const handleEditarProspecto = async () => {
        const { nombres, telefono } = prospectoAEditar;
        if (!nombres?.trim() || !telefono?.trim()) {
            toast.error('Nombres y teléfono son requeridos');
            return;
        }
        setLoadingEditar(true);
        try {
            await axios.put(`${API_URL}/api/${rolePath}/prospectos/${prospectoAEditar.id}/editar`, prospectoAEditar, {
                headers: getAuthHeaders()
            });
            toast.success('Prospecto actualizado');
            setModalEditarAbierto(false);
            cargarDatos();
            if (prospectoSeleccionado && (prospectoSeleccionado.id === prospectoAEditar.id || prospectoSeleccionado._id === prospectoAEditar.id)) {
                cargarDatos();
            }
        } catch (error) {
            toast.error(error.response?.data?.msg || 'Error al actualizar');
        } finally {
            setLoadingEditar(false);
        }
    };

    // Estados para la nueva vista detallada
    const [prospectoSeleccionado, setProspectoSeleccionado] = useState(null);
    const [actividadesContext, setActividadesContext] = useState([]);
    const [loadingContext, setLoadingContext] = useState(false);
    // Estado para el flujo de llamada inline
    const [llamadaFlow, setLlamadaFlow] = useState(null);
    // { paso: 'contesto'|'agendo'|'llamarDespues'|'fecha'|'done', contesto: bool, agendo: bool, llamarDespues: bool, fechaProxima: '', notas: '' }

    const [notasRapidas, setNotasRapidas] = useState('');
    const [loadingNotas, setLoadingNotas] = useState(false);

    const handleGuardarNotasRapidas = async () => {
        if (!prospectoSeleccionado) return;
        setLoadingNotas(true);
        try {
            const pid = prospectoSeleccionado.id || prospectoSeleccionado._id;
            await axios.put(`${API_URL}/api/${rolePath}/prospectos/${pid}/editar`, {
                ...prospectoSeleccionado,
                notas: notasRapidas
            }, { headers: getAuthHeaders() });

            toast.success('Notas guardadas');
            setProspectoSeleccionado(prev => ({ ...prev, notas: notasRapidas }));
            cargarDatos(); // Actualizar lista principal
        } catch (error) {
            toast.error('Error al guardar notas');
        } finally {
            setLoadingNotas(false);
        }
    };

    const getAuthHeaders = () => ({
        'x-auth-token': getToken() || ''
    });

    const cargarDatos = async () => {
        setLoading(true);
        try {
            const resProspectos = await axios.get(`${API_URL}/api/${rolePath}/prospectos`, { headers: getAuthHeaders() });
            setProspectos(resProspectos.data);
            setUsandoMock(false);
        } catch (error) {
            console.error('Error al cargar:', error);
            setUsandoMock(true);
            setProspectos([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    // Orden de prioridad de etapas (más avanzadas primero, perdido al fondo)
    const ORDEN_ETAPA = {
        'reunion_agendada': 1,
        'reunion_realizada': 2,
        'en_negociacion': 3,
        'en_contacto': 4,
        'prospecto_nuevo': 5,
        'venta_ganada': 6,
        'perdido': 99
    };

    const prospectosFiltrados = prospectos
        .filter((p) => {
            const q = busquedaProspecto.toLowerCase();
            const nombre = `${p.nombres || ''} ${p.apellidoPaterno || ''}`.toLowerCase();
            const empresa = (p.empresa || '').toLowerCase();
            const telefono = (p.telefono || '').replace(/\s/g, '');
            const correo = (p.correo || '').toLowerCase();
            const matchBusqueda = !q || nombre.includes(q) || empresa.includes(q) || telefono.includes(q) || correo.includes(q);
            const matchEtapa = filtroEtapa === 'todos' || p.etapaEmbudo === filtroEtapa;
            const matchInteres = filtroInteres === 'todos' || String(p.interes || 0) === filtroInteres;
            const matchRecordatorio = !filtroRecordatorio || !!p.proximaLlamada;
            return matchBusqueda && matchEtapa && matchInteres && matchRecordatorio;
        })
        .sort((a, b) => {
            // Perdidos siempre al fondo
            const esPerdidoA = a.etapaEmbudo === 'perdido';
            const esPerdidoB = b.etapaEmbudo === 'perdido';
            if (esPerdidoA !== esPerdidoB) return esPerdidoA ? 1 : -1;

            // Con próxima llamada urgente primero
            const tieneRecordA = !!a.proximaLlamada;
            const tieneRecordB = !!b.proximaLlamada;
            if (tieneRecordA !== tieneRecordB) return tieneRecordA ? -1 : 1;
            if (tieneRecordA && tieneRecordB) {
                return new Date(a.proximaLlamada) - new Date(b.proximaLlamada);
            }

            // Mayor interés primero
            const interesA = a.interes || 0;
            const interesB = b.interes || 0;
            if (interesB !== interesA) return interesB - interesA;

            // Etapa más avanzada primero
            const orA = ORDEN_ETAPA[a.etapaEmbudo] ?? 10;
            const orB = ORDEN_ETAPA[b.etapaEmbudo] ?? 10;
            return orA - orB;
        });

    const handleCrearProspecto = async () => {
        const { nombres, telefono } = formCrear;
        if (!nombres?.trim() || !telefono?.trim()) {
            toast.error('Nombres y teléfono son requeridos');
            return;
        }
        setLoadingCrear(true);
        try {
            await axios.post(`${API_URL}/api/${rolePath}/crear-prospecto`, formCrear, {
                headers: getAuthHeaders()
            });
            toast.success('Prospecto creado');
            setModalCrearAbierto(false);
            setFormCrear({ nombres: '', apellidoPaterno: '', apellidoMaterno: '', telefono: '', correo: '', empresa: '', notas: '' });
            cargarDatos();
        } catch (error) {
            toast.error(error.response?.data?.msg || 'Error al crear');
        } finally {
            setLoadingCrear(false);
        }
    };

    const handleSeleccionarProspecto = async (p) => {
        setProspectoSeleccionado(p);
        setNotasRapidas(p.notas || ''); // Inicializar notas rápidas
        setLoadingContext(true);
        try {
            // MEJORADO: Usar endpoint de historial completo para ver actividades de AMBOS (prospector y closer)
            const endpoint = `${API_URL}/api/${rolePath}/prospecto/${p.id || p._id}/historial-completo`;
            const res = await axios.get(endpoint, { headers: getAuthHeaders() });
            
            // Si la respuesta incluye timeline completo, extractar actividades
            if (res.data.timeline) {
                // Filtrar solo actividades (no cambios de etapa)
                const actividades = res.data.timeline
                    .filter(item => item.tipo === 'actividad')
                    .map(act => ({
                        id: act.id,
                        tipo: act.tipoActividad,
                        fecha: act.fecha,
                        vendedor: act.vendedorId,
                        vendedorNombre: act.vendedorNombre,
                        vendedorRol: act.vendedorRol,
                        descripcion: act.descripcion,
                        resultado: act.resultado,
                        notas: act.notas
                    }));
                setActividadesContext(actividades);
            } else {
                // Fallback a endpoint antiguo si la respuesta no tiene timeline
                const fallbackRes = await axios.get(`${API_URL}/api/${rolePath}/prospectos/${p.id || p._id}/actividades`, { headers: getAuthHeaders() });
                setActividadesContext(fallbackRes.data);
            }
        } catch (error) {
            console.error(error);
            toast.error('Error al cargar historial del prospecto');
            setActividadesContext([]);
        } finally {
            setLoadingContext(false);
        }
    };

    const actualizarInteres = async (id, nuevoInteres) => {
        try {
            await axios.put(`${API_URL}/api/${rolePath}/prospectos/${id}`, { interes: nuevoInteres }, { headers: getAuthHeaders() });
            toast.success('Interés actualizado');
            setProspectos(prev => prev.map(p => (p.id === id || p._id === id) ? { ...p, interes: nuevoInteres } : p));
            if (prospectoSeleccionado && (prospectoSeleccionado.id === id || prospectoSeleccionado._id === id)) {
                setProspectoSeleccionado({ ...prospectoSeleccionado, interes: nuevoInteres });
            }
        } catch (error) {
            toast.error('Error al actualizar interés');
        }
    };

    const formatHora = (date) => {
        const d = new Date(date);
        return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    };

    // Helpers para vista detallada
    const llamadasExitosas = actividadesContext.filter(a => a.tipo === 'llamada' && a.resultado === 'exitoso').length;
    const llamadasFallidas = actividadesContext.filter(a => a.tipo === 'llamada' && a.resultado !== 'exitoso').length;
    const proximaCita = actividadesContext.find(a => a.tipo === 'cita' && new Date(a.fecha) >= new Date());

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Cargando seguimiento...</p>
                </div>
            </div>
        );
    }

    // Shared Modals Render Function
    const renderModales = () => (
        <>
            {/* Modal Crear Prospecto */}
            {modalCrearAbierto && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <div className="p-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-gray-900">+ Nuevo prospecto</h2>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombres *</label>
                                    <input
                                        type="text"
                                        value={formCrear.nombres}
                                        onChange={(e) => setFormCrear((f) => ({ ...f, nombres: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                        placeholder="Juan"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Apellido *</label>
                                    <input
                                        type="text"
                                        value={formCrear.apellidoPaterno}
                                        onChange={(e) => setFormCrear((f) => ({ ...f, apellidoPaterno: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                        placeholder="García"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono *</label>
                                    <input
                                        type="tel"
                                        value={formCrear.telefono}
                                        onChange={(e) => setFormCrear((f) => ({ ...f, telefono: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                        placeholder="+55 1234 5678"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Correo</label>
                                    <input
                                        type="email"
                                        value={formCrear.correo}
                                        onChange={(e) => setFormCrear((f) => ({ ...f, correo: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                        placeholder="correo@ejemplo.com"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
                                    <input
                                        type="text"
                                        value={formCrear.empresa}
                                        onChange={(e) => setFormCrear((f) => ({ ...f, empresa: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                        placeholder="Mi Empresa"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 p-4 border-t border-slate-100">
                            <button
                                onClick={() => {
                                    setModalCrearAbierto(false);
                                    setFormCrear({ nombres: '', apellidoPaterno: '', apellidoMaterno: '', telefono: '', correo: '', empresa: '', notas: '' });
                                }}
                                className="flex-1 px-3 py-2 border border-slate-200 text-gray-700 rounded text-sm hover:bg-slate-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCrearProspecto}
                                disabled={loadingCrear}
                                className="flex-1 px-3 py-2 bg-teal-600 text-white rounded text-sm hover:bg-teal-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingCrear ? 'Creando...' : '+ Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal Editar Prospecto */}
            {modalEditarAbierto && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <div className="p-4 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-gray-900">✏️ Editar prospecto</h2>
                        </div>
                        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Nombres *</label>
                                    <input
                                        type="text"
                                        value={prospectoAEditar.nombres}
                                        onChange={(e) => setProspectoAEditar((f) => ({ ...f, nombres: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Apellido *</label>
                                    <input
                                        type="text"
                                        value={prospectoAEditar.apellidoPaterno}
                                        onChange={(e) => setProspectoAEditar((f) => ({ ...f, apellidoPaterno: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Teléfono *</label>
                                    <input
                                        type="tel"
                                        value={prospectoAEditar.telefono}
                                        onChange={(e) => setProspectoAEditar((f) => ({ ...f, telefono: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Correo</label>
                                    <input
                                        type="email"
                                        value={prospectoAEditar.correo}
                                        onChange={(e) => setProspectoAEditar((f) => ({ ...f, correo: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Empresa</label>
                                    <input
                                        type="text"
                                        value={prospectoAEditar.empresa}
                                        onChange={(e) => setProspectoAEditar((f) => ({ ...f, empresa: e.target.value }))}
                                        className="w-full border border-slate-200 rounded px-3 py-1.5 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 p-4 border-t border-slate-100">
                            <button
                                onClick={() => setModalEditarAbierto(false)}
                                className="flex-1 px-3 py-2 border border-slate-200 text-gray-700 rounded text-sm hover:bg-slate-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleEditarProspecto}
                                disabled={loadingEditar}
                                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingEditar ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Pasar a Cliente */}
            {modalPasarClienteAbierto && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <div className="p-4 border-b border-slate-100 bg-emerald-50">
                            <h2 className="text-lg font-bold text-emerald-900">🏆 Pasar a cliente</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            <p className="text-gray-600 text-sm">
                                ¿Confirmas que <span className="font-semibold">{prospectoSeleccionado?.nombres} {prospectoSeleccionado?.apellidoPaterno}</span> se convierte en cliente?
                            </p>
                            <textarea
                                rows={2}
                                value={notaConversion}
                                onChange={e => setNotaConversion(e.target.value)}
                                placeholder="Notas (opcional)..."
                                className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-400"
                            />
                        </div>
                        <div className="flex gap-2 p-4 border-t border-slate-100">
                            <button
                                onClick={() => { setModalPasarClienteAbierto(false); setNotaConversion(''); }}
                                className="flex-1 px-3 py-2 border border-slate-200 text-gray-700 rounded text-sm hover:bg-slate-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handlePasarACliente}
                                disabled={loadingConversion}
                                className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingConversion ? 'Procesando...' : '✓ Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Descartar Prospecto */}
            {modalDescartarAbierto && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-lg max-w-sm w-full">
                        <div className="p-4 border-b border-slate-100 bg-red-50">
                            <h2 className="text-lg font-bold text-red-900">🗑️ Descartar prospecto</h2>
                        </div>
                        <div className="p-4 space-y-3">
                            <p className="text-gray-600 text-sm">
                                ¿Descartar a <span className="font-semibold">{prospectoSeleccionado?.nombres} {prospectoSeleccionado?.apellidoPaterno}</span>? Se registrará en el historial.
                            </p>
                            <textarea
                                rows={2}
                                value={notaDescarte}
                                onChange={e => setNotaDescarte(e.target.value)}
                                placeholder="Motivo (opcional)..."
                                className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-400"
                            />
                        </div>
                        <div className="flex gap-2 p-4 border-t border-slate-100">
                            <button
                                onClick={() => { setModalDescartarAbierto(false); setNotaDescarte(''); }}
                                className="flex-1 px-3 py-2 border border-slate-200 text-gray-700 rounded text-sm hover:bg-slate-50 font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDescartar}
                                disabled={loadingConversion}
                                className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingConversion ? 'Procesando...' : '✓ Descartar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    const handlePasarACliente = async () => {
        if (!prospectoSeleccionado) return;
        const pid = prospectoSeleccionado.id || prospectoSeleccionado._id;
        setLoadingConversion(true);
        try {
            await axios.post(`${API_URL}/api/${rolePath}/pasar-a-cliente/${pid}`,
                { notas: notaConversion || 'Prospecto convertido a cliente' },
                { headers: getAuthHeaders() }
            );
            toast.success('¡Prospecto convertido a cliente!');
            setModalPasarClienteAbierto(false);
            setNotaConversion('');
            setProspectoSeleccionado(null);
            // Redirigir a la página de clientes
            setTimeout(() => {
                navigate(`/${rolePath}/clientes`);
            }, 800);
        } catch (err) {
            toast.error(err.response?.data?.msg || 'Error al convertir');
        } finally {
            setLoadingConversion(false);
        }
    };

    const handleDescartar = async () => {
        if (!prospectoSeleccionado) return;
        const pid = prospectoSeleccionado.id || prospectoSeleccionado._id;
        setLoadingConversion(true);
        try {
            await axios.post(`${API_URL}/api/${rolePath}/descartar-prospecto/${pid}`,
                { notas: notaDescarte || 'Prospecto descartado' },
                { headers: getAuthHeaders() }
            );
            toast('Prospecto descartado', { icon: '🗑️' });
            setModalDescartarAbierto(false);
            setNotaDescarte('');
            setProspectoSeleccionado(null);
            cargarDatos();
        } catch (err) {
            toast.error(err.response?.data?.msg || 'Error al descartar');
        } finally {
            setLoadingConversion(false);
        }
    };


    // VISTA DETALLADA DEL PROSPECTO
    if (prospectoSeleccionado) {
        const pid = prospectoSeleccionado.id || prospectoSeleccionado._id;

        // Helpers para el historial enriquecido
        const getActIcon = (act) => {
            if (act.tipo === 'llamada' && act.resultado === 'exitoso') return { icon: '📞', color: 'bg-emerald-500', label: 'Llamada exitosa' };
            if (act.tipo === 'llamada' && act.resultado === 'fallido') return { icon: '📵', color: 'bg-rose-500', label: 'Sin respuesta' };
            if (act.tipo === 'cita') return { icon: '📅', color: 'bg-blue-500', label: 'Cita / Reunión' };
            if (act.tipo === 'whatsapp') return { icon: '💬', color: 'bg-green-500', label: 'WhatsApp' };
            if (act.tipo === 'cliente') return { icon: '🏆', color: 'bg-yellow-500', label: 'Convertido a cliente' };
            if (act.tipo === 'descartado') return { icon: '🗑️', color: 'bg-gray-400', label: 'Descartado' };
            return { icon: '📝', color: 'bg-slate-400', label: act.tipo || 'Interacción' };
        };

        const getResultadoTexto = (act) => {
            if (act.tipo === 'llamada' && act.resultado === 'exitoso') return 'Contestó ✔';
            if (act.tipo === 'llamada' && act.resultado === 'fallido') return 'No contestó ✗';
            if (act.tipo === 'cita') return act.resultado === 'pendiente' ? 'Cita programada' : `Cita: ${act.resultado}`;
            if (act.tipo === 'whatsapp') return 'Mensaje enviado';
            if (act.resultado) return act.resultado;
            return '';
        };

        // Tarea pendiente: mostrar si hay una próxima llamada agendada o cita
        const tareaLlamar = prospectoSeleccionado.proximaLlamada ? { fecha: prospectoSeleccionado.proximaLlamada, tipo: 'llamada' } : null;
        const proximaCita = actividadesContext.find(a => a.tipo === 'cita' && a.resultado === 'pendiente' && new Date(a.fechaCita || a.fecha) >= new Date());

        const registrarActividad = async (payload) => {
            try {
                await axios.post(`${API_URL}/api/${rolePath}/registrar-actividad`, { clienteId: pid, ...payload }, { headers: getAuthHeaders() });
                toast.success('Interacción registrada');
                handleSeleccionarProspecto(prospectoSeleccionado);
            } catch { toast.error('Error al registrar'); }
        };

        return (
            <div className="min-h-screen p-6 bg-slate-50">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Botón regresar */}
                    <button
                        onClick={() => setProspectoSeleccionado(null)}
                        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors font-medium mb-2"
                    >
                        <ArrowLeft className="w-5 h-5" /> Regresar a la lista
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* ===================== COLUMNA IZQUIERDA ===================== */}
                        <div className="lg:col-span-2 space-y-4">

                            {/* Cabecera + Estrellas + Datos de contacto */}
                            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                                    <div>
                                        <h1 className="text-2xl font-bold text-gray-900">
                                            {prospectoSeleccionado.nombres} {prospectoSeleccionado.apellidoPaterno}
                                        </h1>
                                        {prospectoSeleccionado.empresa && (
                                            <p className="text-gray-500 mt-0.5">{prospectoSeleccionado.empresa}</p>
                                        )}
                                        <div className="flex flex-wrap gap-3 mt-3 text-sm text-gray-500">
                                            {prospectoSeleccionado.telefono && (
                                                <span className="flex items-center gap-1"><Phone className="w-4 h-4" /> {prospectoSeleccionado.telefono}</span>
                                            )}
                                            {prospectoSeleccionado.correo && (
                                                <span className="flex items-center gap-1"><Mail className="w-4 h-4" /> {prospectoSeleccionado.correo}</span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Interés (estrellas) */}
                                    <div className="flex items-center gap-1 text-yellow-500 shrink-0">
                                        {[1, 2, 3, 4, 5].map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => actualizarInteres(pid, value)}
                                                className="hover:scale-110 transition-transform"
                                            >
                                                <Star className={`w-6 h-6 ${prospectoSeleccionado.interes >= value ? 'fill-yellow-400' : 'fill-slate-100 text-slate-300'}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Recordatorio de próxima acción */}
                                {tareaLlamar && (
                                    <div className="mt-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 font-medium">
                                        <Clock className="w-4 h-4 shrink-0" />
                                        Próximo seguimiento: {new Date(tareaLlamar.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                    </div>
                                )}
                            </div>

                            {/* Estadísticas editables */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Sí contestó</p>
                                    <p className="text-3xl font-black text-emerald-500">{llamadasExitosas}</p>
                                    <p className="text-xs text-gray-400 mt-1">veces</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">No contestó</p>
                                    <p className="text-3xl font-black text-rose-500">{llamadasFallidas}</p>
                                    <p className="text-xs text-gray-400 mt-1">veces</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Citas</p>
                                    <p className="text-3xl font-black text-blue-500">{actividadesContext.filter(a => a.tipo === 'cita').length}</p>
                                    <p className="text-xs text-gray-400 mt-1">agendadas</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">WhatsApps</p>
                                    <p className="text-3xl font-black text-green-500">{actividadesContext.filter(a => a.tipo === 'whatsapp').length}</p>
                                    <p className="text-xs text-gray-400 mt-1">enviados</p>
                                </div>
                            </div>

                            {/* Próxima cita */}
                            {proximaCita && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                                    <Calendar className="w-8 h-8 text-blue-500 shrink-0" />
                                    <div>
                                        <p className="text-xs font-bold text-blue-500 uppercase tracking-wider">Próxima Reunión</p>
                                        <p className="font-bold text-gray-900">{new Date(proximaCita.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                                        <p className="text-sm text-gray-500">{formatHora(proximaCita.fecha)}</p>
                                    </div>
                                </div>
                            )}

                            {/* ==================== ÁRBOL DE LLAMADA ==================== */}
                            <div className="space-y-3">
                                {llamadaFlow === null ? (
                                    <div className="grid grid-cols-3 gap-3">
                                        {/* Llamar */}
                                        <button
                                            onClick={() => setLlamadaFlow({ paso: 'contesto', notas: '', fechaProxima: '', interesado: null })}
                                            className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-blue-500 rounded-xl p-4 text-gray-700 hover:text-blue-600 transition-all shadow-sm font-bold text-sm"
                                        >
                                            <Phone className="w-6 h-6" />
                                            Llamar
                                        </button>
                                        {/* WhatsApp */}
                                        <button
                                            onClick={async () => {
                                                const phone = (prospectoSeleccionado.telefono || '').replace(/\D/g, '');
                                                if (!phone) { toast.error('Sin teléfono registrado'); return; }
                                                window.open(`https://api.whatsapp.com/send?phone=${phone}&text=Hola%20${encodeURIComponent(prospectoSeleccionado.nombres || '')}%2C%20te%20contacto%20de%20parte%20de%20nuestro%20equipo.`, '_blank');
                                                await registrarActividad({ tipo: 'whatsapp', resultado: 'enviado', notas: 'Mensaje de WhatsApp enviado' });
                                            }}
                                            className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-green-500 rounded-xl p-4 text-gray-700 hover:text-green-600 transition-all shadow-sm font-bold text-sm"
                                        >
                                            <MessageSquare className="w-6 h-6" />
                                            WhatsApp
                                        </button>
                                        {/* Agendar reunión */}
                                        <button
                                            onClick={() => navigate(`/${rolePath}/calendario`, { state: { prospecto: prospectoSeleccionado } })}
                                            className="flex flex-col items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-teal-500 rounded-xl p-4 text-gray-700 hover:text-teal-600 transition-all shadow-sm font-bold text-sm text-center leading-tight"
                                        >
                                            <Calendar className="w-6 h-6" />
                                            Agendar Reunión
                                        </button>
                                    </div>
                                ) : (
                                    /* ===== FLUJO DE LLAMADA ===== */
                                    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-blue-700 flex items-center gap-2"><Phone className="w-4 h-4" /> Registrando llamada...</span>
                                            <button onClick={() => setLlamadaFlow(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-white/60">✕ Cancelar</button>
                                        </div>

                                        {/* Paso 1: ¿Contestó? */}
                                        {llamadaFlow.paso === 'contesto' && (
                                            <div className="space-y-3">
                                                <p className="font-semibold text-gray-800">¿Contestó la llamada?</p>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => setLlamadaFlow(f => ({ ...f, paso: 'agendo', contesto: true }))}
                                                        className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-bold hover:bg-emerald-600 transition-colors"
                                                    >✓ Sí, contestó</button>
                                                    <button
                                                        onClick={async () => {
                                                            await registrarActividad({ tipo: 'llamada', resultado: 'fallido', notas: 'No contestó' });
                                                            setLlamadaFlow(null);
                                                        }}
                                                        className="flex-1 py-2.5 bg-rose-500 text-white rounded-lg font-bold hover:bg-rose-600 transition-colors"
                                                    >✗ No contestó</button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Paso 2: ¿Agendó Cita? */}
                                        {llamadaFlow.paso === 'agendo' && (
                                            <div className="space-y-3">
                                                <p className="font-semibold text-gray-800">¿Agendó una reunión/cita?</p>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={async () => {
                                                            await registrarActividad({ tipo: 'llamada', resultado: 'exitoso', notas: 'Agendó reunión (Redirigido a calendario)' });
                                                            setLlamadaFlow(null);
                                                            navigate(`/${rolePath}/calendario`, { state: { prospecto: prospectoSeleccionado } });
                                                        }}
                                                        className="flex-1 py-2.5 bg-teal-500 text-white rounded-lg font-bold hover:bg-teal-600 transition-colors"
                                                    >✓ Registrar en calendario</button>
                                                    <button
                                                        onClick={() => setLlamadaFlow(f => ({ ...f, paso: 'interesado', agendo: false }))}
                                                        className="flex-1 py-2.5 bg-slate-500 text-white rounded-lg font-bold hover:bg-slate-600 transition-colors"
                                                    >✗ No agendó</button>
                                                </div>
                                            </div>
                                        )}



                                        {/* Paso 3: ¿Le interesó? (si no agendó) */}
                                        {llamadaFlow.paso === 'interesado' && (
                                            <div className="space-y-3">
                                                <p className="font-semibold text-gray-800">¿Le interesó el producto/servicio?</p>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => {
                                                            const hoy = new Date();
                                                            hoy.setDate(hoy.getDate() + 3);
                                                            const defaultDate = hoy.toISOString().slice(0, 16);
                                                            setLlamadaFlow(f => ({ ...f, paso: 'llamarDespues', interesado: true, fechaProxima: defaultDate }));
                                                        }}
                                                        className="flex-1 py-2.5 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 transition-colors"
                                                    >✓ Sí, llamar después</button>
                                                    <button
                                                        onClick={async () => {
                                                            await registrarActividad({ tipo: 'llamada', resultado: 'exitoso', notas: llamadaFlow.notas || 'Contestó, sin interés' });
                                                            setLlamadaFlow(null);
                                                            toast('Sin interés — considera descartarlo', { icon: '💡' });
                                                        }}
                                                        className="flex-1 py-2.5 bg-gray-400 text-white rounded-lg font-bold hover:bg-gray-500 transition-colors"
                                                    >✗ Sin interés</button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Paso 3a: Llamar después — marcar fecha */}
                                        {llamadaFlow.paso === 'llamarDespues' && (
                                            <div className="space-y-3">
                                                <p className="font-semibold text-blue-700">📅 ¿Cuándo le llamamos?</p>
                                                <input
                                                    type="datetime-local"
                                                    value={llamadaFlow.fechaProxima}
                                                    onChange={e => setLlamadaFlow(f => ({ ...f, fechaProxima: e.target.value }))}
                                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400"
                                                />
                                                <textarea
                                                    rows={2}
                                                    value={llamadaFlow.notas}
                                                    onChange={e => setLlamadaFlow(f => ({ ...f, notas: e.target.value }))}
                                                    placeholder="Notas de la llamada..."
                                                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-400"
                                                />
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const notasFin = llamadaFlow.notas || 'Interesado, llamar después';
                                                            const pidLocal = prospectoSeleccionado.id || prospectoSeleccionado._id;

                                                            // 1. Registrar Actividad
                                                            await axios.post(`${API_URL}/api/${rolePath}/registrar-actividad`,
                                                                { clienteId: pidLocal, tipo: 'llamada', resultado: 'exitoso', notas: notasFin },
                                                                { headers: getAuthHeaders() }
                                                            );

                                                            if (llamadaFlow.fechaProxima) {
                                                                // 2. Crear Tarea
                                                                await axios.post(`${API_URL}/api/tareas`, {
                                                                    titulo: `Llamada de seguimiento: ${prospectoSeleccionado.nombres}`,
                                                                    descripcion: notasFin,
                                                                    cliente: pidLocal,
                                                                    fechaLimite: llamadaFlow.fechaProxima,
                                                                    prioridad: 'media'
                                                                }, { headers: getAuthHeaders() });

                                                                // 3. Actualizar prospecto (interes y proximaLlamada)
                                                                await axios.put(`${API_URL}/api/${rolePath}/prospectos/${pidLocal}/editar`, {
                                                                    ...prospectoSeleccionado,
                                                                    proximaLlamada: llamadaFlow.fechaProxima
                                                                }, { headers: getAuthHeaders() });
                                                            }

                                                            toast.success('Seguimiento guardado correctamente');
                                                            setLlamadaFlow(null);
                                                            cargarDatos(); // Recargar lista
                                                            handleSeleccionarProspecto(prospectoSeleccionado); // Recargar timeline
                                                        } catch (err) {
                                                            console.error(err);
                                                            toast.error('Error al guardar el seguimiento completo');
                                                        }
                                                    }}
                                                    className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700"
                                                >✓ Guardar seguimiento</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ========= CUADRO DE NOTAS EDITABLE ========= */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Notas del Prospecto</p>
                                        <button
                                            onClick={handleGuardarNotasRapidas}
                                            disabled={loadingNotas}
                                            className="text-[10px] bg-teal-600 text-white px-2 py-1 rounded font-bold hover:bg-teal-700 transition-colors disabled:opacity-50"
                                        >
                                            {loadingNotas ? 'Guardando...' : '✓ Guardar'}
                                        </button>
                                    </div>
                                    <textarea
                                        value={notasRapidas}
                                        onChange={(e) => setNotasRapidas(e.target.value)}
                                        placeholder="Escribe notas importantes aquí..."
                                        className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-teal-400 focus:border-transparent outline-none min-h-[100px] resize-none scrollbar-hide"
                                    />
                                </div>

                                {/* Acciones de conversión / descarte */}
                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <button
                                        onClick={() => setModalPasarClienteAbierto(true)}
                                        className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl p-3 font-bold text-sm shadow-sm transition-colors"
                                    >
                                        <CheckCircle2 className="w-5 h-5" />
                                        Pasar a cliente
                                    </button>
                                    <button
                                        onClick={() => setModalDescartarAbierto(true)}
                                        className="flex items-center justify-center gap-2 bg-white border-2 border-slate-200 hover:border-red-400 hover:bg-red-50 rounded-xl p-3 text-gray-500 hover:text-red-600 font-bold text-sm shadow-sm transition-all"
                                    >
                                        <XCircle className="w-5 h-5" />
                                        Descartar
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ===================== COLUMNA DERECHA: HISTORIAL ===================== */}
                        <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden" style={{ maxHeight: '650px' }}>
                            <div className="p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-xl flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">Historial de interacciones</h3>
                                <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 font-semibold">{actividadesContext.length}</span>
                            </div>
                            <div
                                className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-hide"
                                style={{ minHeight: 0 }}
                            >
                                {loadingContext ? (
                                    <div className="flex justify-center items-center h-32">
                                        <RefreshCw className="w-8 h-8 text-teal-500 animate-spin" />
                                    </div>
                                ) : actividadesContext.length === 0 ? (
                                    <div className="text-center text-gray-400 mt-10">
                                        <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">Sin interacciones registradas aún.</p>
                                    </div>
                                ) : (
                                    [...actividadesContext].reverse().map((act, index) => {
                                        const meta = getActIcon(act);
                                        return (
                                            <div key={act.id || index} className="flex gap-3">
                                                {/* Ícono */}
                                                <div className={`w-9 h-9 rounded-full ${meta.color} flex items-center justify-center text-lg shrink-0 shadow-sm`}>
                                                    <span>{meta.icon}</span>
                                                </div>
                                                {/* Contenido */}
                                                <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <p className="font-semibold text-gray-900 text-sm">{meta.label}</p>
                                                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{formatHora(act.fecha)}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {new Date(act.fecha).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        {act.vendedorNombre && <> · {act.vendedorNombre}</>}
                                                    </p>
                                                    {getResultadoTexto(act) && (
                                                        <p className="text-xs font-medium text-gray-600 mt-1">{getResultadoTexto(act)}</p>
                                                    )}
                                                    {act.notas && (
                                                        <p className="text-xs text-gray-500 mt-1.5 italic bg-white px-2 py-1.5 rounded-lg border border-slate-100">
                                                            "{act.notas}"
                                                        </p>
                                                    )}
                                                    {act.fechaCita && (
                                                        <p className="text-xs text-blue-600 mt-1.5 font-medium">
                                                            📅 {new Date(act.fechaCita).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                {renderModales()}
            </div>
        );
    }






    // VISTA PRINCIPAL (LISTA DE PROSPECTOS)
    return (
        <div className="min-h-screen p-6 bg-slate-50">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Seguimiento de Prospectos</h1>
                        <p className="text-gray-500 mt-1">
                            Selecciona un prospecto para ver su ficha y registrar interacciones
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {usandoMock && (
                            <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs rounded-lg">
                                Datos de demostración
                            </span>
                        )}
                        <button
                            onClick={() => setModalCrearAbierto(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium"
                        >
                            <UserPlus className="w-5 h-5" />
                            Crear prospecto
                        </button>
                    </div>
                </div>

                {/* Buscador + Filtros 50/50 */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="flex flex-col lg:flex-row gap-3">
                        {/* 50% Búsqueda */}
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, empresa, correo o teléfono..."
                                value={busquedaProspecto}
                                onChange={(e) => setBusquedaProspecto(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-slate-50 text-sm"
                            />
                        </div>
                        {/* 50% Filtros */}
                        <div className="flex-1 flex flex-wrap gap-2 items-center">
                            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                            {/* Etapa */}
                            <select
                                value={filtroEtapa}
                                onChange={(e) => setFiltroEtapa(e.target.value)}
                                className="flex-1 min-w-[130px] border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-gray-700 focus:ring-2 focus:ring-teal-400 focus:outline-none cursor-pointer"
                            >
                                <option value="todos">Todas las etapas</option>
                                <option value="prospecto_nuevo">Sin contacto</option>
                                <option value="en_contacto">En contacto</option>
                                <option value="reunion_agendada">Cita agendada</option>
                                <option value="reunion_realizada">Cita realizada</option>
                                <option value="en_negociacion">Negociación</option>
                                <option value="venta_ganada">Venta ganada</option>
                                <option value="perdido">Perdido</option>
                            </select>
                            {/* Interés */}
                            <select
                                value={filtroInteres}
                                onChange={(e) => setFiltroInteres(e.target.value)}
                                className="flex-1 min-w-[120px] border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-gray-700 focus:ring-2 focus:ring-teal-400 focus:outline-none cursor-pointer"
                            >
                                <option value="todos">⭐ Cualquier interés</option>
                                <option value="5">⭐⭐⭐⭐⭐ Muy alto</option>
                                <option value="4">⭐⭐⭐⭐ Alto</option>
                                <option value="3">⭐⭐⭐ Medio</option>
                                <option value="2">⭐⭐ Bajo</option>
                                <option value="1">⭐ Muy bajo</option>
                                <option value="0">Sin calificar</option>
                            </select>
                            {/* Recordatorio pendiente */}
                            <button
                                onClick={() => setFiltroRecordatorio(v => !v)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${filtroRecordatorio
                                    ? 'bg-blue-50 border-blue-400 text-blue-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
                                    }`}
                                title="Solo con recordatorio de llamada"
                            >
                                <Bell className="w-3.5 h-3.5" />
                                Recordatorio
                            </button>
                            {/* Reset filtros */}
                            {(filtroEtapa !== 'todos' || filtroInteres !== 'todos' || filtroRecordatorio || busquedaProspecto) && (
                                <button
                                    onClick={() => { setFiltroEtapa('todos'); setFiltroInteres('todos'); setFiltroRecordatorio(false); setBusquedaProspecto(''); }}
                                    className="px-2 py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 font-medium transition-colors"
                                    title="Limpiar filtros"
                                >
                                    ✕ Limpiar
                                </button>
                            )}
                        </div>
                    </div>
                    {/* Contador de resultados */}
                    <p className="text-xs text-slate-400 mt-2">
                        Mostrando <span className="font-semibold text-slate-600">{prospectosFiltrados.length}</span> de <span className="font-semibold text-slate-600">{prospectos.length}</span> prospectos
                    </p>
                </div>

                {/* Lista de Prospectos (Tarjetas o Tabla simplificada) */}
                {prospectosFiltrados.length === 0 ? (
                    <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
                        <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                        <p className="text-gray-500 font-medium">No se encontraron prospectos.</p>
                        <p className="text-gray-400 text-sm mt-1">Intenta con otra búsqueda o crea uno nuevo.</p>
                    </div>
                ) : (
                    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-100/70 text-slate-600">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                                        <th className="px-4 py-3 text-left font-semibold">Empresa</th>
                                        <th className="px-4 py-3 text-left font-semibold">Contacto</th>
                                        <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Etapa</th>
                                        <th className="px-4 py-3 text-left font-semibold">Recordatorio</th>
                                        <th className="px-4 py-3 text-center font-semibold">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {prospectosFiltrados.map((p) => (
                                        <tr key={p._id || p.id} className="hover:bg-slate-50/70 transition-colors cursor-pointer" onClick={() => handleSeleccionarProspecto(p)}>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <p className="font-medium text-gray-900">
                                                        {p.nombres} {p.apellidoPaterno}
                                                    </p>
                                                    <div className="flex items-center gap-0.5 text-yellow-500 scale-75 origin-left mt-0.5">
                                                        <Star className={`w-3.5 h-3.5 ${p.interes >= 1 ? 'fill-yellow-400' : 'fill-slate-100 text-slate-300'}`} />
                                                        <Star className={`w-3.5 h-3.5 ${p.interes >= 3 ? 'fill-yellow-400' : 'fill-slate-100 text-slate-300'}`} />
                                                        <Star className={`w-3.5 h-3.5 ${p.interes >= 5 ? 'fill-yellow-400' : 'fill-slate-100 text-slate-300'}`} />
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 text-sm">{p.empresa || '—'}</td>
                                            <td className="px-4 py-3">
                                                <div className="space-y-0.5">
                                                    <p className="text-gray-700 text-sm font-medium">{p.telefono}</p>
                                                    {/* <p className="text-gray-500 text-xs truncate max-w-[150px]">{p.correo}</p> */}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getEtapaColor(p.etapaEmbudo)}`}>
                                                    {getEtapaLabel(p.etapaEmbudo)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {p.proximaLlamada ? (
                                                    <div className="flex items-center gap-1.5 text-blue-600">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                        <span className="text-xs font-semibold">
                                                            {new Date(p.proximaLlamada).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                        <Phone className="w-3 h-3" />
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400 italic">Sin pendiente</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-3">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); abrirModalEditar(p); }}
                                                        className="text-gray-400 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                                                        title="Editar Prospecto"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleSeleccionarProspecto(p); }}
                                                        className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium text-sm p-2 rounded-lg hover:bg-teal-50"
                                                        title="Ver Seguimiento"
                                                    >
                                                        <ChevronRight className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            {renderModales()}
        </div>
    );
};

export default ProspectorSeguimiento;
