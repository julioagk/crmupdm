import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Users, RefreshCw, Award, Clock, BarChart3, Target, CheckCircle2, DollarSign, AlertTriangle, TrendingDown, Zap } from 'lucide-react';
import axios from 'axios';
import FunnelVisual from '../../components/FunnelVisual';

import API_URL from '../../config/api';
import socket from '../../config/socket';

// Datos iniciales en 0 cuando no hay conexión
const INITIAL_DATA = {
    embudo: {
        reunion_agendada: 0,
        reunion_realizada: 0,
        propuesta_enviada: 0,
        venta_ganada: 0
    },
    metricas: {
        reuniones: { hoy: 0, pendientes: 0, realizadas: 0 },
        ventas: { mes: 0, montoMes: 0, totales: 0, montoTotal: 0 },
        clientes: { totales: 0 },
        negociaciones: { activas: 0 }
    },
    tasasConversion: {
        asistencia: 0,
        interes: 0,
        cierre: 0,
        global: 0
    },
    analisisPerdidas: {
        no_asistio: 0,
        no_interesado: 0
    },
    comparativos: {
        reunionesHoy: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: 'Hoy', etiquetaAnterior: 'Ayer' },
        asistenciaSemanal: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: '7 dias', etiquetaAnterior: '7 dias previos' },
        cierreMensual: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: 'Mes actual', etiquetaAnterior: 'Mes anterior' },
        montoMensual: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: 'Mes actual', etiquetaAnterior: 'Mes anterior' },
        interesMensual: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: 'Mes actual', etiquetaAnterior: 'Mes anterior' },
        ventasMensual: { actual: 0, anterior: 0, variacion: 0, etiquetaActual: 'Mes actual', etiquetaAnterior: 'Mes anterior' }
    },
    detalleKpis: {
        reunionesHoy: { titulo: 'Reuniones de hoy', tipo: 'reuniones', items: [] },
        ventasMes: { titulo: 'Ventas del mes', tipo: 'ventas', items: [] },
        resumenTasas: {
            titulo: 'Detalle de tasas',
            tipo: 'resumen_tasas',
            asistencia: { actual: { agendadas: 0, realizadas: 0, tasa: 0 }, anterior: { agendadas: 0, realizadas: 0, tasa: 0 } },
            interes: { actual: { reuniones: 0, propuestas: 0, tasa: 0 }, anterior: { reuniones: 0, propuestas: 0, tasa: 0 } },
            cierre: { actual: { propuestas: 0, ventas: 0, tasa: 0 }, anterior: { propuestas: 0, ventas: 0, tasa: 0 } }
        }
    }
};

const CloserDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [tareas, setTareas] = useState([]);
    const [loadingTareas, setLoadingTareas] = useState(false);
    const [usandoMock, setUsandoMock] = useState(false);
    const [kpiActivo, setKpiActivo] = useState(null);

    // Función para sanitizar datos y evitar NaN
    const sanitizeData = (rawData) => {
        if (!rawData) return INITIAL_DATA;

        const getNumero = (val) => {
            const num = parseFloat(val);
            return isNaN(num) || num === null ? 0 : num;
        };

        return {
            ...rawData,
            embudo: {
                reunion_agendada: getNumero(rawData?.embudo?.reunion_agendada),
                reunion_realizada: getNumero(rawData?.embudo?.reunion_realizada),
                propuesta_enviada: getNumero(rawData?.embudo?.propuesta_enviada),
                venta_ganada: getNumero(rawData?.embudo?.venta_ganada)
            },
            metricas: {
                reuniones: {
                    hoy: getNumero(rawData?.metricas?.reuniones?.hoy),
                    pendientes: getNumero(rawData?.metricas?.reuniones?.pendientes),
                    realizadas: getNumero(rawData?.metricas?.reuniones?.realizadas),
                    realizadasHoy: getNumero(rawData?.metricas?.reuniones?.realizadasHoy),
                    propuestasHoy: getNumero(rawData?.metricas?.reuniones?.propuestasHoy)
                },
                ventas: {
                    mes: getNumero(rawData?.metricas?.ventas?.mes),
                    montoMes: getNumero(rawData?.metricas?.ventas?.montoMes),
                    totales: getNumero(rawData?.metricas?.ventas?.totales),
                    montoTotal: getNumero(rawData?.metricas?.ventas?.montoTotal),
                    ventasHoy: getNumero(rawData?.metricas?.ventas?.ventasHoy)
                },
                clientes: {
                    totales: getNumero(rawData?.metricas?.clientes?.totales)
                },
                negociaciones: {
                    activas: getNumero(rawData?.metricas?.negociaciones?.activas)
                }
            },
            tasasConversion: {
                asistencia: getNumero(rawData?.tasasConversion?.asistencia),
                interes: getNumero(rawData?.tasasConversion?.interes),
                cierre: getNumero(rawData?.tasasConversion?.cierre),
                global: getNumero(rawData?.tasasConversion?.global)
            },
            analisisPerdidas: {
                no_asistio: getNumero(rawData?.analisisPerdidas?.no_asistio),
                no_interesado: getNumero(rawData?.analisisPerdidas?.no_interesado)
            },
            comparativos: {
                reunionesHoy: {
                    actual: getNumero(rawData?.comparativos?.reunionesHoy?.actual),
                    anterior: getNumero(rawData?.comparativos?.reunionesHoy?.anterior),
                    variacion: getNumero(rawData?.comparativos?.reunionesHoy?.variacion),
                    etiquetaActual: rawData?.comparativos?.reunionesHoy?.etiquetaActual || 'Hoy',
                    etiquetaAnterior: rawData?.comparativos?.reunionesHoy?.etiquetaAnterior || 'Ayer'
                },
                asistenciaSemanal: {
                    actual: getNumero(rawData?.comparativos?.asistenciaSemanal?.actual),
                    anterior: getNumero(rawData?.comparativos?.asistenciaSemanal?.anterior),
                    variacion: getNumero(rawData?.comparativos?.asistenciaSemanal?.variacion),
                    etiquetaActual: rawData?.comparativos?.asistenciaSemanal?.etiquetaActual || '7 dias',
                    etiquetaAnterior: rawData?.comparativos?.asistenciaSemanal?.etiquetaAnterior || '7 dias previos'
                },
                cierreMensual: {
                    actual: getNumero(rawData?.comparativos?.cierreMensual?.actual),
                    anterior: getNumero(rawData?.comparativos?.cierreMensual?.anterior),
                    variacion: getNumero(rawData?.comparativos?.cierreMensual?.variacion),
                    etiquetaActual: rawData?.comparativos?.cierreMensual?.etiquetaActual || 'Mes actual',
                    etiquetaAnterior: rawData?.comparativos?.cierreMensual?.etiquetaAnterior || 'Mes anterior'
                },
                montoMensual: {
                    actual: getNumero(rawData?.comparativos?.montoMensual?.actual),
                    anterior: getNumero(rawData?.comparativos?.montoMensual?.anterior),
                    variacion: getNumero(rawData?.comparativos?.montoMensual?.variacion),
                    etiquetaActual: rawData?.comparativos?.montoMensual?.etiquetaActual || 'Mes actual',
                    etiquetaAnterior: rawData?.comparativos?.montoMensual?.etiquetaAnterior || 'Mes anterior'
                },
                interesMensual: {
                    actual: getNumero(rawData?.comparativos?.interesMensual?.actual),
                    anterior: getNumero(rawData?.comparativos?.interesMensual?.anterior),
                    variacion: getNumero(rawData?.comparativos?.interesMensual?.variacion),
                    etiquetaActual: rawData?.comparativos?.interesMensual?.etiquetaActual || 'Mes actual',
                    etiquetaAnterior: rawData?.comparativos?.interesMensual?.etiquetaAnterior || 'Mes anterior'
                },
                ventasMensual: {
                    actual: getNumero(rawData?.comparativos?.ventasMensual?.actual),
                    anterior: getNumero(rawData?.comparativos?.ventasMensual?.anterior),
                    variacion: getNumero(rawData?.comparativos?.ventasMensual?.variacion),
                    etiquetaActual: rawData?.comparativos?.ventasMensual?.etiquetaActual || 'Mes actual',
                    etiquetaAnterior: rawData?.comparativos?.ventasMensual?.etiquetaAnterior || 'Mes anterior'
                }
            },
            detalleKpis: {
                reunionesHoy: {
                    titulo: rawData?.detalleKpis?.reunionesHoy?.titulo || 'Reuniones de hoy',
                    tipo: rawData?.detalleKpis?.reunionesHoy?.tipo || 'reuniones',
                    items: Array.isArray(rawData?.detalleKpis?.reunionesHoy?.items) ? rawData.detalleKpis.reunionesHoy.items : []
                },
                ventasMes: {
                    titulo: rawData?.detalleKpis?.ventasMes?.titulo || 'Ventas del mes',
                    tipo: rawData?.detalleKpis?.ventasMes?.tipo || 'ventas',
                    items: Array.isArray(rawData?.detalleKpis?.ventasMes?.items) ? rawData.detalleKpis.ventasMes.items : []
                },
                resumenTasas: {
                    titulo: rawData?.detalleKpis?.resumenTasas?.titulo || 'Detalle de tasas',
                    tipo: rawData?.detalleKpis?.resumenTasas?.tipo || 'resumen_tasas',
                    asistencia: {
                        actual: {
                            agendadas: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.actual?.agendadas),
                            realizadas: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.actual?.realizadas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.actual?.tasa)
                        },
                        anterior: {
                            agendadas: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.anterior?.agendadas),
                            realizadas: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.anterior?.realizadas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.asistencia?.anterior?.tasa)
                        }
                    },
                    interes: {
                        actual: {
                            reuniones: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.actual?.reuniones),
                            propuestas: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.actual?.propuestas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.actual?.tasa)
                        },
                        anterior: {
                            reuniones: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.anterior?.reuniones),
                            propuestas: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.anterior?.propuestas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.interes?.anterior?.tasa)
                        }
                    },
                    cierre: {
                        actual: {
                            propuestas: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.actual?.propuestas),
                            ventas: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.actual?.ventas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.actual?.tasa)
                        },
                        anterior: {
                            propuestas: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.anterior?.propuestas),
                            ventas: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.anterior?.ventas),
                            tasa: getNumero(rawData?.detalleKpis?.resumenTasas?.cierre?.anterior?.tasa)
                        }
                    }
                }
            }
        };
    };

    const getAuthHeaders = () => ({
        'x-auth-token': localStorage.getItem('token') || ''
    });

    const cargarDatos = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const token = localStorage.getItem('token');

            if (!token) {
                setData(INITIAL_DATA);
                setUsandoMock(true);
                setLoading(false);
                return;
            }

            const config = { headers: { 'x-auth-token': token } };

            try {
                const res = await axios.get(`${API_URL}/api/closer/dashboard`, config);
                setData(sanitizeData(res.data));
                setUsandoMock(false);
            } catch (error) {
                console.log('⚠️ Usando datos iniciales (sin backend):', error.message);
                setData(INITIAL_DATA);
                setUsandoMock(true);
            }
        } catch (error) {
            setData(INITIAL_DATA);
            setUsandoMock(true);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const cargarProximasReuniones = async (silent = false) => {
        if (!silent) setLoadingTareas(true);
        try {
            const response = await axios.get(`${API_URL}/api/closer/calendario`, { headers: getAuthHeaders() });

            const ahora = new Date();

            // 1. Filtrar solo las reuniones que NO han pasado (de ahora en adelante)
            // 2. Filtrar que sigan pendientes (por si la API trae algo más)
            const proximas = response.data.filter(r => {
                const fecha = new Date(r.fecha);
                const esPendiente = r.resultado === 'pendiente' || !r.resultado;
                return fecha >= ahora && esPendiente;
            });

            // 3. Ordenar por fecha (más cercanas primero)
            proximas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            // 4. Tomar solo las top 3
            setTareas(proximas.slice(0, 3));
        } catch (error) {
            console.error('Error al cargar próximas reuniones:', error);
        } finally {
            if (!silent) setLoadingTareas(false);
        }
    };

    useEffect(() => {
        cargarDatos();
        cargarProximasReuniones();
        const interval = setInterval(() => {
            cargarDatos(true);
            cargarProximasReuniones(true);
        }, 5 * 60 * 1000);

        socket.on('prospectos_actualizados', (obj) => {
            console.log('socket: prospectos actualizados detectado', obj);
            cargarDatos(true);
            cargarProximasReuniones(true);
        });

        return () => {
            clearInterval(interval);
            socket.off('prospectos_actualizados');
        };
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen p-6 flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Cargando dashboard...</p>
                </div>
            </div>
        );
    }

    if (!data) return null;

    const formatoDelta = (valor, esPorcentaje = true) => {
        const n = Number(valor || 0);
        const sign = n > 0 ? '+' : '';
        return `${sign}${n.toFixed(1)}${esPorcentaje ? '%' : '%'}`;
    };

    const badgeDelta = (valor) => {
        if (valor > 0) {
            return { cls: 'bg-green-100 text-green-700 border border-green-200', icon: <TrendingUp className="w-3 h-3" /> };
        }
        if (valor < 0) {
            return { cls: 'bg-red-100 text-red-700 border border-red-200', icon: <TrendingDown className="w-3 h-3" /> };
        }
        return { cls: 'bg-gray-100 text-gray-600 border border-gray-200', icon: <BarChart3 className="w-3 h-3" /> };
    };

    const renderComparativo = (compKey, esPorcentaje = true) => {
        const comp = data.comparativos?.[compKey] || { variacion: 0, actual: 0, anterior: 0, etiquetaActual: 'Actual', etiquetaAnterior: 'Anterior' };
        const badge = badgeDelta(comp.variacion);
        return (
            <div className="mt-2 flex flex-col items-center gap-1">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.cls}`}>
                    {badge.icon}
                    {formatoDelta(comp.variacion, esPorcentaje)}
                </span>
                <span className="text-[10px] text-gray-500 text-center">
                    {comp.etiquetaActual}: {esPorcentaje ? `${comp.actual.toFixed(1)}%` : comp.actual.toLocaleString('es-MX')} | {comp.etiquetaAnterior}: {esPorcentaje ? `${comp.anterior.toFixed(1)}%` : comp.anterior.toLocaleString('es-MX')}
                </span>
            </div>
        );
    };

    const toggleKpi = (key) => {
        setKpiActivo((prev) => (prev === key ? null : key));
    };

    return (
        <div className="h-full flex flex-col p-5 overflow-hidden">
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden min-h-0">
                {/* Embudo Header - White Section */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-md flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <BarChart3 className="w-6 h-6 text-green-600" />
                            Embudo de Ventas
                        </h2>
                        {usandoMock && (
                            <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-md border border-gray-200 font-semibold">
                                Sin datos
                            </span>
                        )}
                    </div>
                    <FunnelVisual
                        stages={[
                            {
                                etapa: 'Reuniones Agendadas',
                                cantidad: data.embudo.reunion_agendada,
                                color: 'bg-blue-500',
                                contadorHoy: data.metricas.reuniones.hoy,
                                labelContador: 'hoy',
                                cantidadExito: data.embudo.reunion_realizada,
                                cantidadPerdida: data.analisisPerdidas.no_asistio,
                                porcentajeExito: Math.round(data.tasasConversion.asistencia) || 0,
                                porcentajePerdida: data.embudo.reunion_agendada > 0 ? ((data.analisisPerdidas.no_asistio / data.embudo.reunion_agendada) * 100).toFixed(1) : 0,
                                labelExito: 'asisten',
                                labelPerdida: 'no asisten'
                            },
                            {
                                etapa: 'Reuniones Realizadas',
                                cantidad: data.embudo.reunion_realizada,
                                color: 'bg-cyan-500',
                                contadorHoy: data.metricas.reuniones.realizadasHoy,
                                labelContador: 'hoy',
                                cantidadExito: data.embudo.propuesta_enviada,
                                cantidadPerdida: data.analisisPerdidas.no_interesado,
                                porcentajeExito: Math.round(data.tasasConversion.interes) || 0,
                                porcentajePerdida: data.embudo.reunion_realizada > 0 ? ((data.analisisPerdidas.no_interesado / data.embudo.reunion_realizada) * 100).toFixed(1) : 0,
                                labelExito: 'piden propuesta',
                                labelPerdida: 'no interesados'
                            },
                            {
                                etapa: 'Propuestas Enviadas',
                                cantidad: data.embudo.propuesta_enviada,
                                color: 'bg-orange-500',
                                contadorHoy: data.metricas.reuniones.propuestasHoy,
                                labelContador: 'hoy',
                                cantidadExito: data.embudo.venta_ganada,
                                cantidadPerdida: data.embudo.propuesta_enviada - data.embudo.venta_ganada,
                                porcentajeExito: Math.round(data.tasasConversion.cierre) || 0,
                                porcentajePerdida: data.embudo.propuesta_enviada > 0 ? (((data.embudo.propuesta_enviada - data.embudo.venta_ganada) / data.embudo.propuesta_enviada) * 100).toFixed(1) : 0,
                                labelExito: 'aceptada',
                                labelPerdida: 'rechazada o en proceso'
                            },
                            {
                                etapa: 'Ventas Cerradas',
                                cantidad: data.embudo.venta_ganada,
                                color: 'bg-green-500',
                                contadorHoy: data.metricas.ventas.ventasHoy,
                                labelContador: 'hoy',
                                cantidadExito: data.embudo.venta_ganada,
                                porcentajeExito: 100,
                                labelExito: 'ganadas'
                            }
                        ]}
                        type="closer"
                    />
                </div>

                {/* Main Content: Metrics Grid + Tasks Sidebar */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 min-h-0">
                    {/* Left Side: Metrics Grid (2 columns) */}
                    <div className="lg:col-span-2 flex flex-col min-h-0">
                        <div className="grid grid-cols-2 grid-rows-3 gap-4 flex-1">
                            {/* Row 1 */}
                            <button
                                type="button"
                                onClick={() => toggleKpi('reuniones_hoy')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'reuniones_hoy' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'}`}
                            >
                                <Calendar className="w-8 h-8 text-blue-600 mb-2" />
                                <span className="text-3xl font-bold text-gray-900 mb-1">{data.metricas.reuniones.hoy}</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Reuniones Hoy</p>
                                {renderComparativo('reunionesHoy', false)}
                            </button>

                            <button
                                type="button"
                                onClick={() => toggleKpi('tasa_asistencia')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'tasa_asistencia' ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-gray-200'}`}
                            >
                                <CheckCircle2 className="w-8 h-8 text-cyan-600 mb-2" />
                                <span className="text-3xl font-bold text-gray-900 mb-1">{Math.round(data.tasasConversion.asistencia) || 0}%</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Tasa de Asistencia</p>
                                {renderComparativo('asistenciaSemanal', true)}
                            </button>

                            {/* Row 2 */}
                            <button
                                type="button"
                                onClick={() => toggleKpi('tasa_cierre')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'tasa_cierre' ? 'border-green-400 ring-2 ring-green-100' : 'border-gray-200'}`}
                            >
                                <TrendingUp className="w-8 h-8 text-green-600 mb-2" />
                                <span className="text-3xl font-bold text-gray-900 mb-1">{Math.round(data.tasasConversion.cierre) || 0}%</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Tasa de Cierre</p>
                                {renderComparativo('cierreMensual', true)}
                            </button>

                            <button
                                type="button"
                                onClick={() => toggleKpi('monto_mes')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'monto_mes' ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-200'}`}
                            >
                                <DollarSign className="w-8 h-8 text-emerald-600 mb-2" />
                                <span className="text-2xl font-bold text-gray-900 mb-1">${(data.metricas.ventas.montoMes || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Monto del Mes</p>
                                {renderComparativo('montoMensual', false)}
                            </button>

                            {/* Row 3 */}
                            <button
                                type="button"
                                onClick={() => toggleKpi('tasa_interes')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'tasa_interes' ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200'}`}
                            >
                                <Award className="w-8 h-8 text-purple-600 mb-2" />
                                <span className="text-3xl font-bold text-gray-900 mb-1">{Math.round(data.tasasConversion.interes) || 0}%</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Tasa de Interés</p>
                                {renderComparativo('interesMensual', true)}
                            </button>

                            <button
                                type="button"
                                onClick={() => toggleKpi('ventas_mes')}
                                className={`bg-white border-2 rounded-xl p-4 shadow-md flex flex-col items-center justify-center transition-all hover:shadow-lg ${kpiActivo === 'ventas_mes' ? 'border-pink-400 ring-2 ring-pink-100' : 'border-gray-200'}`}
                            >
                                <TrendingUp className="w-8 h-8 text-pink-600 mb-2" />
                                <span className="text-3xl font-bold text-gray-900 mb-1">{data.metricas.ventas.mes}</span>
                                <p className="text-gray-600 text-xs font-semibold text-center">Ventas del Mes</p>
                                {renderComparativo('ventasMensual', false)}
                            </button>
                        </div>

                    </div>

                    {/* Right Side: Tasks/Goals Sidebar - White Section (2 columns) */}
                    <div className="lg:col-span-2 flex flex-col min-h-0">
                        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-6 shadow-md flex flex-col overflow-hidden">
                            <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2 flex-shrink-0">
                                <Calendar className="w-6 h-6 text-blue-600" />
                                Próximas Reuniones
                            </h2>

                            <div className="flex-1 space-y-4 overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3b82f6 #f3f4f6' }}>
                                {loadingTareas ? (
                                    <div className="flex justify-center items-center h-20">
                                        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                                    </div>
                                ) : tareas.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                                        <Calendar className="w-10 h-10 opacity-20" />
                                        <p className="text-sm">No tienes reuniones próximas programadas.</p>
                                    </div>
                                ) : (
                                    tareas.map((t) => {
                                        // Extraer links de Google Meet o Zoom de las notas
                                        let meetLink = null;
                                        if (t.notas) {
                                            const meetMatch = t.notas.match(/https:\/\/(?:meet\.google\.com|us\d+web\.zoom\.us\/j)\/[^\s]+/i);
                                            if (meetMatch) meetLink = meetMatch[0];
                                        }

                                        return (
                                            <div key={t.id || t._id} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col group hover:border-blue-300 transition-colors shadow-sm gap-2">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                                            <h3 className="font-bold text-gray-900 text-sm truncate">
                                                                {t.cliente?.nombres} {t.cliente?.apellidoPaterno}
                                                            </h3>
                                                        </div>
                                                        {t.cliente?.empresa && (
                                                            <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                                                🏢 {t.cliente.empresa}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="bg-blue-100 text-blue-700 font-bold text-xs px-2 py-1 rounded-md shrink-0 border border-blue-200">
                                                        {new Date(t.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                    {t.cliente?.telefono && (
                                                        <span className="flex items-center gap-1 truncate text-[10px]">
                                                            📞 {t.cliente.telefono}
                                                        </span>
                                                    )}
                                                    {t.cliente?.correo && (
                                                        <span className="flex items-center gap-1 truncate text-[10px]">
                                                            📧 {t.cliente.correo}
                                                        </span>
                                                    )}
                                                </div>

                                                {t.notas && (
                                                    <div className="mt-2 text-xs text-gray-600 bg-white p-2 rounded border border-gray-100 italic">
                                                        {t.notas}
                                                    </div>
                                                )}

                                                {meetLink && (
                                                    <a
                                                        href={meetLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2 text-xs transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                        </svg>
                                                        Unirse a la Reunión
                                                    </a>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {kpiActivo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setKpiActivo(null)}>
                    <div className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl border border-gray-200 shadow-2xl p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-900">Detalle del KPI</h3>
                            <button type="button" onClick={() => setKpiActivo(null)} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Cerrar</button>
                        </div>

                        {kpiActivo === 'reuniones_hoy' && (
                            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2">
                                {(data.detalleKpis?.reunionesHoy?.items || []).length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">No hay reuniones registradas hoy.</p>
                                ) : (data.detalleKpis?.reunionesHoy?.items || []).map((item) => (
                                    <div key={item.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50">
                                        <p className="text-xs font-bold text-gray-800">{item.clienteNombre}</p>
                                        <p className="text-[11px] text-gray-500">{item.empresa || 'Sin empresa'} • {new Date(item.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {kpiActivo === 'ventas_mes' && (
                            <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-2">
                                {(data.detalleKpis?.ventasMes?.items || []).length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">No hay ventas en este mes.</p>
                                ) : (data.detalleKpis?.ventasMes?.items || []).map((venta) => (
                                    <div key={venta.id} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50 flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-xs font-bold text-gray-800">Venta #{venta.id}</p>
                                            <p className="text-[11px] text-gray-500">{new Date(venta.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</p>
                                        </div>
                                        <p className="text-xs font-bold text-emerald-700">${Number(venta.monto || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {['tasa_asistencia', 'tasa_interes', 'tasa_cierre', 'monto_mes'].includes(kpiActivo) && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Periodo Actual</p>
                                    <p className="text-sm font-black text-gray-900">{kpiActivo === 'tasa_asistencia' ? `${data.detalleKpis?.resumenTasas?.asistencia?.actual?.tasa || 0}%` : kpiActivo === 'tasa_interes' ? `${data.detalleKpis?.resumenTasas?.interes?.actual?.tasa || 0}%` : kpiActivo === 'tasa_cierre' ? `${data.detalleKpis?.resumenTasas?.cierre?.actual?.tasa || 0}%` : `$${(data.comparativos?.montoMensual?.actual || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}</p>
                                </div>
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Periodo Anterior</p>
                                    <p className="text-sm font-black text-gray-900">{kpiActivo === 'tasa_asistencia' ? `${data.detalleKpis?.resumenTasas?.asistencia?.anterior?.tasa || 0}%` : kpiActivo === 'tasa_interes' ? `${data.detalleKpis?.resumenTasas?.interes?.anterior?.tasa || 0}%` : kpiActivo === 'tasa_cierre' ? `${data.detalleKpis?.resumenTasas?.cierre?.anterior?.tasa || 0}%` : `$${(data.comparativos?.montoMensual?.anterior || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CloserDashboard;
