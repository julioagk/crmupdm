import React, { useState, useEffect } from 'react';
import { Search, Filter, Calendar, UserPlus, Phone, Mail, RefreshCw, ChevronRight } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getToken } from '../../utils/authUtils';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const ProspectorProspectos = () => {
    const navigate = useNavigate();
    const [prospectos, setProspectos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [filtroEtapa, setFiltroEtapa] = useState('todos');
    const [modalAgendar, setModalAgendar] = useState(null);
    const [fechaReunion, setFechaReunion] = useState('');
    const [closerSeleccionado, setCloserSeleccionado] = useState('');
    const [closers, setClosers] = useState([]);
    const [loadingAccion, setLoadingAccion] = useState(false);

    const getAuthHeaders = () => ({
        'x-auth-token': getToken() || ''
    });

    const cargarDatos = async () => {
        setLoading(true);
        try {
            const [resP, resC] = await Promise.all([
                axios.get(`${API_URL}/api/prospector/prospectos`, { headers: getAuthHeaders() }),
                axios.get(`${API_URL}/api/auth/vendedores?rol=closer`, { headers: getAuthHeaders() })
            ]);
            setProspectos(resP.data);
            setClosers(resC.data || []);
        } catch (error) {
            console.error('Error al cargar datos:', error);
            toast.error('Error al conectar con el servidor');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, []);

    const prospectosFiltrados = prospectos.filter(p => {
        const nombres = `${p.nombres || ''} ${p.apellidoPaterno || ''}`.toLowerCase();
        const empresa = (p.empresa || '').toLowerCase();
        const matchBusqueda = busqueda === '' ||
            nombres.includes(busqueda.toLowerCase()) ||
            empresa.includes(busqueda.toLowerCase()) ||
            (p.telefono && p.telefono.includes(busqueda));

        const matchEtapa = filtroEtapa === 'todos' || p.etapaEmbudo === filtroEtapa;

        return matchBusqueda && matchEtapa;
    });

    const getEtapaColor = (etapa) => {
        switch (etapa) {
            case 'prospecto_nuevo': return 'bg-slate-500/20 text-slate-400';
            case 'en_contacto': return 'bg-blue-500/20 text-blue-400';
            case 'reunion_agendada': return 'bg-purple-500/20 text-purple-400';
            case 'reunion_realizada': return 'bg-indigo-500/20 text-indigo-400';
            case 'en_negociacion': return 'bg-amber-500/20 text-amber-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const getEtapaLabel = (etapa) => {
        switch (etapa) {
            case 'prospecto_nuevo': return 'Sin contacto';
            case 'en_contacto': return 'En Contacto';
            case 'reunion_agendada': return 'Cita Agendada';
            case 'reunion_realizada': return 'Cita Realizada';
            case 'en_negociacion': return 'Negociación';
            default: return etapa;
        }
    };

    const handleAgendarReunion = async () => {
        if (!modalAgendar || !fechaReunion || !closerSeleccionado) return;
        setLoadingAccion(true);
        try {
            await axios.post(`${API_URL}/api/prospector/agendar-reunion`, {
                clienteId: modalAgendar.id || modalAgendar._id,
                closerId: closerSeleccionado,
                fechaReunion,
                notas: 'Agendado desde vista de prospectos'
            }, { headers: getAuthHeaders() });

            toast.success('Reunión agendada exitosamente');
            setModalAgendar(null);
            setFechaReunion('');
            setCloserSeleccionado('');
            cargarDatos();
        } catch (error) {
            toast.error(error.response?.data?.msg || 'Error al agendar');
        } finally {
            setLoadingAccion(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-teal-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Cargando prospectos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white">Mis Prospectos</h1>
                        <p className="text-gray-400 mt-1">{prospectos.length} prospectos asignados</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/prospector/seguimiento')}
                            className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors flex items-center gap-2 font-semibold"
                        >
                            <UserPlus className="w-4 h-4" />
                            Nuevo Prospecto
                        </button>
                    </div>
                </div>

                {/* Búsqueda y Filtros */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, empresa, teléfono..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-teal-500"
                        />
                    </div>
                    <select
                        value={filtroEtapa}
                        onChange={(e) => setFiltroEtapa(e.target.value)}
                        className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-teal-500"
                    >
                        <option value="todos">Todas las etapas</option>
                        <option value="prospecto_nuevo">Sin contacto</option>
                        <option value="en_contacto">En Contacto</option>
                        <option value="reunion_agendada">Cita Agendada</option>
                        <option value="reunion_realizada">Cita Realizada</option>
                        <option value="en_negociacion">Negociación</option>
                    </select>
                </div>

                {/* Tabla de Prospectos */}
                <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-900/50 border-b border-gray-700">
                                <tr>
                                    <th className="text-left p-4 text-gray-400 font-semibold">Cliente</th>
                                    <th className="text-left p-4 text-gray-400 font-semibold">Empresa</th>
                                    <th className="text-center p-4 text-gray-400 font-semibold">Etapa</th>
                                    <th className="text-center p-4 text-gray-400 font-semibold">Recordatorio</th>
                                    <th className="text-center p-4 text-gray-400 font-semibold">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {prospectosFiltrados.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-8 text-center text-gray-500">
                                            No se encontraron prospectos que coincidan con los filtros.
                                        </td>
                                    </tr>
                                ) : (
                                    prospectosFiltrados.map((prospecto) => (
                                        <tr
                                            key={prospecto.id || prospecto._id}
                                            className="hover:bg-gray-800/30 transition-colors cursor-pointer group"
                                            onClick={() => navigate('/prospector/seguimiento', { state: { selectedId: prospecto.id || prospecto._id } })}
                                        >
                                            <td className="p-4">
                                                <p className="text-white font-semibold">
                                                    {prospecto.nombres} {prospecto.apellidoPaterno}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-gray-400 text-xs flex items-center gap-1">
                                                        <Phone className="w-3 h-3" /> {prospecto.telefono}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-gray-300">{prospecto.empresa || '—'}</td>
                                            <td className="p-4 text-center">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getEtapaColor(prospecto.etapaEmbudo)}`}>
                                                    {getEtapaLabel(prospecto.etapaEmbudo)}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center">
                                                {prospecto.proximaLlamada ? (
                                                    <span className="text-blue-400 text-xs font-medium">
                                                        {new Date(prospecto.proximaLlamada).toLocaleDateString()}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs italic">Sin pendiente</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-center">
                                                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate('/prospector/seguimiento', { state: { selectedId: prospecto.id || prospecto._id } });
                                                        }}
                                                        className="px-3 py-1 bg-teal-500/20 text-teal-400 rounded-lg hover:bg-teal-500/30 transition-colors text-xs font-semibold flex items-center gap-1"
                                                    >
                                                        Seguimiento <ChevronRight className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Modal Agendar Reunión */}
                {modalAgendar && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl">
                            <h2 className="text-2xl font-bold text-white mb-4">Agendar Reunión</h2>
                            <div className="bg-gray-800/50 rounded-lg p-3 mb-6">
                                <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold mb-1">Cliente</p>
                                <p className="text-white font-bold text-lg">
                                    {modalAgendar.nombres} {modalAgendar.apellidoPaterno}
                                </p>
                                <p className="text-gray-400 text-sm">{modalAgendar.empresa}</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-gray-400 text-sm font-medium mb-2">Fecha y Hora</label>
                                    <input
                                        type="datetime-local"
                                        value={fechaReunion}
                                        onChange={(e) => setFechaReunion(e.target.value)}
                                        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-gray-400 text-sm font-medium mb-2">Asignar a Closer</label>
                                    <select
                                        value={closerSeleccionado}
                                        onChange={(e) => setCloserSeleccionado(e.target.value)}
                                        className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 appearance-none"
                                    >
                                        <option value="">Seleccionar closer...</option>
                                        {closers.map(closer => (
                                            <option key={closer.id} value={closer.id}>{closer.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="flex gap-3 mt-8">
                                <button
                                    onClick={() => setModalAgendar(null)}
                                    disabled={loadingAccion}
                                    className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors font-semibold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAgendarReunion}
                                    disabled={!fechaReunion || !closerSeleccionado || loadingAccion}
                                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-lg shadow-purple-900/40"
                                >
                                    {loadingAccion ? 'Procesando...' : 'Confirmar Cita'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProspectorProspectos;
