import React, { useState, useEffect } from 'react';
import { Users, Phone, Calendar, TrendingUp, RefreshCw, Activity, Target, AlertCircle, CheckCircle2, X, ChevronRight, BarChart3, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const CloserMonitoreoProspectors = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [periodo, setPeriodo] = useState('diario');
    const [usandoMock, setUsandoMock] = useState(false);
    const [selectedProspector, setSelectedProspector] = useState(null);
    const [viewMode, setViewMode] = useState('cards'); // 'cards' o 'table'

    const mockData = {
        periodo: 'diario',
        totalProspectors: 3,
        prospectors: [
            {
                prospector: { id: '1', nombre: 'Juan Pérez', correo: 'juan@example.com' },
                metricas: {
                    llamadas: { total: 15, exitosas: 8 },
                    citas: { agendadas: 2, transferidas: 2 },
                    prospectos: { total: 45, nuevos: 5, revisados: 15 },
                    tasas: { contacto: 53.3, agendamiento: 25.0 }
                },
                distribucion: { prospecto_nuevo: 20, en_contacto: 15, reunion_agendada: 10 },
                rendimiento: { estado: 'excelente', color: 'green', descripcion: 'Rendimiento excelente - Cumpliendo metas' },
                detalleHoy: { llamadas: 15, llamadasExitosas: 8, mensajes: 2, citasAgendadas: 2, prospectosRegistrados: 5, estado: 'excelente', color: 'green' },
                detalleSemana: { llamadas: 65, llamadasExitosas: 30, mensajes: 10, citasAgendadas: 9, prospectosRegistrados: 20, estado: 'excelente', color: 'green' }
            },
            {
                prospector: { id: '2', nombre: 'María García', correo: 'maria@example.com' },
                metricas: {
                    llamadas: { total: 10, exitosas: 5 },
                    citas: { agendadas: 1, transferidas: 1 },
                    prospectos: { total: 38, nuevos: 3, revisados: 10 },
                    tasas: { contacto: 50.0, agendamiento: 20.0 }
                },
                distribucion: { prospecto_nuevo: 18, en_contacto: 12, reunion_agendada: 8 },
                rendimiento: { estado: 'bueno', color: 'yellow', descripcion: 'Buen rendimiento - En camino' },
                detalleHoy: { llamadas: 8, llamadasExitosas: 3, mensajes: 1, citasAgendadas: 1, prospectosRegistrados: 2, estado: 'bueno', color: 'yellow' },
                detalleSemana: { llamadas: 45, llamadasExitosas: 20, mensajes: 5, citasAgendadas: 5, prospectosRegistrados: 12, estado: 'bueno', color: 'yellow' }
            },
            {
                prospector: { id: '3', nombre: 'Carlos López', correo: 'carlos@example.com' },
                metricas: {
                    llamadas: { total: 5, exitosas: 2 },
                    citas: { agendadas: 0, transferidas: 0 },
                    prospectos: { total: 30, nuevos: 2, revisados: 5 },
                    tasas: { contacto: 40.0, agendamiento: 0 }
                },
                distribucion: { prospecto_nuevo: 15, en_contacto: 10, reunion_agendada: 5 },
                rendimiento: { estado: 'bajo', color: 'orange', descripcion: 'Rendimiento bajo - Necesita atención' },
                detalleHoy: { llamadas: 2, llamadasExitosas: 0, mensajes: 0, citasAgendadas: 0, prospectosRegistrados: 0, estado: 'critico', color: 'red' },
                detalleSemana: { llamadas: 15, llamadasExitosas: 5, mensajes: 2, citasAgendadas: 1, prospectosRegistrados: 4, estado: 'bajo', color: 'orange' }
            }
        ]
    };

    const cargarDatos = async () => {
        setLoading(true);
        try {
            const response = await axios.get(`${API_URL}/api/closer/prospectors/monitoring`, {
                params: { periodo },
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            setData(response.data);
            setUsandoMock(false);
        } catch (error) {
            console.error('Error al cargar monitoreo:', error);
            setData(mockData);
            setUsandoMock(true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        cargarDatos();
    }, [periodo]);

    const getColorClasses = (color) => {
        const colors = {
            green: {
                bg: 'bg-green-50',
                border: 'border-green-200',
                text: 'text-green-700',
                badge: 'bg-green-500 text-white',
            },
            yellow: {
                bg: 'bg-yellow-50',
                border: 'border-yellow-200',
                text: 'text-yellow-700',
                badge: 'bg-yellow-500 text-white',
            },
            orange: {
                bg: 'bg-orange-50',
                border: 'border-orange-200',
                text: 'text-orange-700',
                badge: 'bg-orange-500 text-white',
            },
            red: {
                bg: 'bg-red-50',
                border: 'border-red-200',
                text: 'text-red-700',
                badge: 'bg-red-500 text-white',
            },
            gray: {
                bg: 'bg-gray-50',
                border: 'border-gray-200',
                text: 'text-gray-700',
                badge: 'bg-gray-500 text-white',
            }
        };
        return colors[color] || colors.green;
    };

    const getEstadoIcon = (estado) => {
        switch (estado) {
            case 'excelente': return <CheckCircle2 className="w-4 h-4" />;
            case 'bueno': return <TrendingUp className="w-4 h-4" />;
            case 'bajo': return <AlertCircle className="w-4 h-4" />;
            case 'critico': return <AlertCircle className="w-4 h-4" />;
            default: return <Activity className="w-4 h-4" />;
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen p-6 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Cargando monitoreo...</p>
                </div>
            </div>
        );
    }

    if (!data || !data.prospectors || data.prospectors.length === 0) {
        return (
            <div className="min-h-screen p-6 flex items-center justify-center">
                <p className="text-gray-600">No hay datos disponibles</p>
            </div>
        );
    }

    // Si hay un prospector seleccionado, mostrar vista de detalles expandida
    if (selectedProspector) {
        return (
            <div className="min-h-screen bg-gray-50 p-4">
                <div className="max-w-7xl mx-auto">
                    {/* Header Expandido */}
                    <div className={`${selectedProspector.rendimiento.color === 'green' ? 'bg-green-50 border-green-200' :
                        selectedProspector.rendimiento.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' :
                            selectedProspector.rendimiento.color === 'orange' ? 'bg-orange-50 border-orange-200' :
                                'bg-red-50 border-red-200'
                        } border rounded-xl p-4 mb-4`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 flex items-start gap-4">
                                <button
                                    onClick={() => setSelectedProspector(null)}
                                    className="p-2 hover:bg-black/5 rounded-full transition-colors shrink-0 mt-1"
                                    title="Volver al monitoreo"
                                >
                                    <ArrowLeft className="w-6 h-6 text-gray-600 hover:text-gray-900" />
                                </button>

                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-md border-3 border-white shrink-0">
                                            <Users className="w-7 h-7 text-gray-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <h1 className="text-2xl font-bold text-gray-900 truncate">{selectedProspector.prospector.nombre}</h1>
                                            <p className="text-gray-600 text-xs truncate">{selectedProspector.prospector.correo}</p>
                                        </div>
                                    </div>
                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 ml-[68px] ${selectedProspector.rendimiento.color === 'green' ? 'bg-green-500 text-white' :
                                            selectedProspector.rendimiento.color === 'yellow' ? 'bg-yellow-500 text-white' :
                                                selectedProspector.rendimiento.color === 'orange' ? 'bg-orange-500 text-white' :
                                                    'bg-red-500 text-white'
                                        } rounded-full text-xs font-bold shadow-md`}>
                                        {getEstadoIcon(selectedProspector.rendimiento.estado)}
                                        <span className="capitalize">{selectedProspector.rendimiento.estado.toUpperCase()}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Contenido Grid Compacto */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Columna Izquierda - HOY */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-blue-600" />
                                Resumen de Hoy
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {/* Llamadas */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Phone className="w-6 h-6 text-blue-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleHoy?.llamadas || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">LLAMADAS TOTALES</p>
                                    <p className="text-blue-600 text-[10px] font-bold mt-1 bg-blue-50 px-2 py-0.5 rounded-full">{selectedProspector.detalleHoy?.llamadasExitosas || 0} EXITOSAS</p>
                                </div>
                                {/* Citas Agendadas */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Calendar className="w-6 h-6 text-purple-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleHoy?.citasAgendadas || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">CITAS AGENDADAS</p>
                                </div>
                                {/* Mensajes */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Users className="w-6 h-6 text-orange-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleHoy?.mensajes || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">MENSAJES ENVIADOS</p>
                                </div>
                                {/* Prospectos */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Target className="w-6 h-6 text-green-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleHoy?.prospectosRegistrados || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">PROSPECTOS REGIST.</p>
                                </div>
                            </div>

                            {/* Resultado del día */}
                            <div className={`${getColorClasses(selectedProspector.detalleHoy?.color || 'gray').bg} border ${getColorClasses(selectedProspector.detalleHoy?.color || 'gray').border} rounded-xl p-4 shadow-sm text-center`}>
                                <h4 className={`text-xs font-bold mb-1 flex items-center gap-1 ${getColorClasses(selectedProspector.detalleHoy?.color || 'gray').text}`}>
                                    <AlertCircle className="w-3 h-3" /> Resultado del Día
                                </h4>
                                <p className={`capitalize font-bold text-lg ${getColorClasses(selectedProspector.detalleHoy?.color || 'gray').text}`}>
                                    {selectedProspector.detalleHoy?.estado || 'Sin Datos'}
                                </p>
                            </div>
                        </div>

                        {/* Columna Derecha - SEMANA */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-purple-600" />
                                Resumen de la Semana
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                {/* Llamadas */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Phone className="w-6 h-6 text-blue-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleSemana?.llamadas || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">LLAMADAS TOTALES</p>
                                    <p className="text-blue-600 text-[10px] font-bold mt-1 bg-blue-50 px-2 py-0.5 rounded-full">{selectedProspector.detalleSemana?.llamadasExitosas || 0} EXITOSAS</p>
                                </div>
                                {/* Citas Agendadas */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Calendar className="w-6 h-6 text-purple-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleSemana?.citasAgendadas || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">CITAS AGENDADAS</p>
                                </div>
                                {/* Mensajes */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Users className="w-6 h-6 text-orange-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleSemana?.mensajes || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">MENSAJES ENVIADOS</p>
                                </div>
                                {/* Prospectos */}
                                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col items-center justify-center text-center">
                                    <Target className="w-6 h-6 text-green-600 mb-2" />
                                    <p className="text-3xl font-bold text-gray-900 leading-none">{selectedProspector.detalleSemana?.prospectosRegistrados || 0}</p>
                                    <p className="text-gray-600 text-[11px] font-semibold mt-1">PROSPECTOS REGIST.</p>
                                </div>
                            </div>

                            {/* Resultado Semana */}
                            <div className={`${getColorClasses(selectedProspector.detalleSemana?.color || 'gray').bg} border ${getColorClasses(selectedProspector.detalleSemana?.color || 'gray').border} rounded-xl p-4 shadow-sm text-center`}>
                                <h4 className={`text-xs font-bold mb-1 flex items-center gap-1 ${getColorClasses(selectedProspector.detalleSemana?.color || 'gray').text}`}>
                                    <AlertCircle className="w-3 h-3" /> Resultado de la Semana
                                </h4>
                                <p className={`capitalize font-bold text-lg ${getColorClasses(selectedProspector.detalleSemana?.color || 'gray').text}`}>
                                    {selectedProspector.detalleSemana?.estado || 'Sin Datos'}
                                </p>
                            </div>
                        </div>
                    </div>
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
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <Users className="w-8 h-8 text-green-600" />
                            Monitoreo de Prospectors
                        </h1>
                        <p className="text-gray-600 mt-1">
                            Seguimiento del desempeño de tu equipo de prospección
                            {usandoMock && (
                                <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-md border border-yellow-200">
                                    Datos de demostración
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex rounded-lg border border-gray-300 shadow-sm">
                            <button
                                onClick={() => setViewMode('cards')}
                                className={`px-4 py-2 transition-colors ${viewMode === 'cards' ? 'bg-green-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                                <Eye className="w-4 h-4 inline mr-1" /> Vista
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`px-4 py-2 transition-colors border-l border-gray-300 ${viewMode === 'table' ? 'bg-green-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                            >
                                <BarChart3 className="w-4 h-4 inline mr-1" /> Tabla
                            </button>
                        </div>
                        <button
                            onClick={cargarDatos}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center gap-2 shadow-md"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Actualizar
                        </button>
                    </div>
                </div>

                {/* Filtros de Período */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-4">
                        <span className="text-gray-700 font-medium">Período:</span>
                        <div className="flex gap-2">
                            {['diario', 'semanal', 'mensual'].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriodo(p)}
                                    className={`px-4 py-2 rounded-lg font-medium transition-all ${periodo === p
                                        ? 'bg-green-500 text-white shadow-lg'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>
                        <div className="ml-auto text-sm text-gray-600">
                            Total: <span className="text-gray-900 font-bold">{data.totalProspectors}</span> prospectors
                        </div>
                    </div>
                </div>

                {/* Resumen General */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                            <span className="text-2xl font-bold text-gray-900">
                                {data.prospectors.filter(p => p.rendimiento.estado === 'excelente').length}
                            </span>
                        </div>
                        <p className="text-green-700 text-sm font-semibold">Excelente</p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <TrendingUp className="w-6 h-6 text-yellow-600" />
                            <span className="text-2xl font-bold text-gray-900">
                                {data.prospectors.filter(p => p.rendimiento.estado === 'bueno').length}
                            </span>
                        </div>
                        <p className="text-yellow-700 text-sm font-semibold">Bueno</p>
                    </div>

                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <AlertCircle className="w-6 h-6 text-orange-600" />
                            <span className="text-2xl font-bold text-gray-900">
                                {data.prospectors.filter(p => p.rendimiento.estado === 'bajo').length}
                            </span>
                        </div>
                        <p className="text-orange-700 text-sm font-semibold">Bajo</p>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <AlertCircle className="w-6 h-6 text-red-600" />
                            <span className="text-2xl font-bold text-gray-900">
                                {data.prospectors.filter(p => p.rendimiento.estado === 'critico').length}
                            </span>
                        </div>
                        <p className="text-red-700 text-sm font-semibold">Crítico</p>
                    </div>
                </div>

                {/* Grid de Prospectors - COMPACT */}
                {viewMode === 'cards' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {data.prospectors.map((item) => {
                            const colorClasses = getColorClasses(item.rendimiento.color);

                            return (
                                <div
                                    key={item.prospector.id}
                                    className={`${colorClasses.bg} border ${colorClasses.border} rounded-xl p-4 transition-all hover:shadow-lg cursor-pointer`}
                                    onClick={() => setSelectedProspector(item)}
                                >
                                    {/* Header Compacto */}
                                    <div className="flex items-start justify-between mb-3">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-bold text-gray-900 truncate">{item.prospector.nombre}</h3>
                                            <p className="text-gray-600 text-xs truncate">{item.prospector.correo}</p>
                                        </div>
                                        <div className={`flex items-center gap-1 px-2 py-1 ${colorClasses.badge} rounded-lg shadow-sm ml-2 shrink-0`}>
                                            {getEstadoIcon(item.rendimiento.estado)}
                                            <span className="font-semibold capitalize text-xs">{item.rendimiento.estado}</span>
                                        </div>
                                    </div>

                                    {/* Métricas Rápidas */}
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        <div className="text-center">
                                            <p className="text-xl font-bold text-gray-900">{item.metricas.llamadas.total}</p>
                                            <p className="text-xs text-gray-600">Llamadas</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xl font-bold text-gray-900">{item.metricas.citas.agendadas}</p>
                                            <p className="text-xs text-gray-600">Citas</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-xl font-bold text-gray-900">{item.metricas.tasas.contacto}%</p>
                                            <p className="text-xs text-gray-600">Contacto</p>
                                        </div>
                                    </div>

                                    {/* Botón Ver Detalles */}
                                    <button
                                        className="w-full bg-white border border-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedProspector(item);
                                        }}
                                    >
                                        Ver Detalles
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    // VISTA TABLA
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="text-left px-6 py-4 text-gray-700 font-semibold text-sm">Prospector</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Llamadas</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Exitosas</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Tasa</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Citas</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Transferencias</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Prospectos</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Estado</th>
                                    <th className="text-center px-6 py-4 text-gray-700 font-semibold text-sm">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.prospectors.map((item, index) => {
                                    const colorClasses = getColorClasses(item.rendimiento.color);
                                    return (
                                        <tr key={item.prospector.id} className={`border-b border-gray-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors`}>
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">{item.prospector.nombre}</p>
                                                    <p className="text-gray-600 text-xs">{item.prospector.correo}</p>
                                                </div>
                                            </td>
                                            <td className="text-center px-6 py-4 text-gray-900 font-bold">{item.metricas.llamadas.total}</td>
                                            <td className="text-center px-6 py-4 text-green-600 font-bold">{item.metricas.llamadas.exitosas}</td>
                                            <td className="text-center px-6 py-4">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                                                    {item.metricas.tasas.contacto}%
                                                </span>
                                            </td>
                                            <td className="text-center px-6 py-4 text-purple-600 font-bold">{item.metricas.citas.agendadas}</td>
                                            <td className="text-center px-6 py-4 text-gray-600">{item.metricas.citas.transferidas}</td>
                                            <td className="text-center px-6 py-4 text-gray-600">{item.metricas.prospectos.total}</td>
                                            <td className="text-center px-6 py-4">
                                                <div className={`inline-flex items-center gap-1 px-2 py-1 ${colorClasses.badge} rounded-lg`}>
                                                    {getEstadoIcon(item.rendimiento.estado)}
                                                    <span className="capitalize text-xs font-semibold">{item.rendimiento.estado}</span>
                                                </div>
                                            </td>
                                            <td className="text-center px-6 py-4">
                                                <button
                                                    onClick={() => setSelectedProspector(item)}
                                                    className="text-blue-600 hover:text-blue-800 font-semibold text-sm"
                                                >
                                                    Ver
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CloserMonitoreoProspectors;
