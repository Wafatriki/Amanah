import { Injectable } from '@angular/core';
import { Dependent } from '../models/dependent.model';
import { Medication } from '../models/medication.model';
import { Task } from '../models/task.model';
import { Appointment } from '../models/appointment.model';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  constructor() {}

  /**
   * Mapear rol técnico a texto en español
   */
  private getRoleLabel(role: string): string {
    const roleMap: { [key: string]: string } = {
      'primary_caregiver': 'Cuidador Principal',
      'collaborative_caregiver': 'Cuidador Colaborativo',
      'guest': 'Invitado',
      'admin': 'Administrador'
    };
    return roleMap[role] || role;
  }

  /**
   * Exportar información de dependiente a JSON
   */
  exportDependentToJSON(
    dependent: Dependent,
    medications?: Medication[],
    tasks?: Task[],
    appointments?: Appointment[],
    caregivers?: User[]
  ): void {
    const uniqueTasks = this.deduplicateTasks(tasks || []);

    const exportData = {
      dependent: {
        id: dependent.id,
        name: dependent.name,
        age: dependent.age,
        medicalConditions: dependent.medicalConditions,
        createdAt: dependent.createdAt,
      },
      personalInfo: {
        name: dependent.name,
        age: dependent.age,
        medicalConditions: dependent.medicalConditions,
        createdAt: dependent.createdAt,
      },
      appointments: (appointments || []).map(apt => ({
        date: apt.date,
        time: apt.time,
        specialty: apt.specialty,
        doctor: apt.doctor,
        location: apt.location,
        reason: apt.reason,
        status: apt.status
      })),
      medications: (medications || []).map(med => ({
        name: med.name,
        dose: med.dose,
        presentation: med.presentation,
        schedules: med.schedules,
        isActive: med.isActive
      })),
      caregivers: (caregivers || []).map(c => ({
        name: c.name,
        email: c.email,
        role: this.getRoleLabel(c.role),
        phone: c.phone || c.phoneNumber
      })),
      tasks: uniqueTasks,
      exportDate: new Date().toISOString(),
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    this.downloadFile(dataStr, `${dependent.name}_datos_${this.getFormattedDate()}.json`, 'application/json');
  }

  /**
   * Exportar información de dependiente a CSV
   */
  exportDependentToCSV(
    dependent: Dependent,
    medications?: Medication[],
    tasks?: Task[],
    appointments?: Appointment[],
    caregivers?: User[]
  ): void {
    const uniqueTasks = this.deduplicateTasks(tasks || []);

    let csvContent = 'data:text/csv;charset=utf-8,';

    csvContent += 'INFORMACIÓN DEL DEPENDIENTE\n';
    csvContent += `Nombre,${dependent.name}\n`;
    csvContent += `Edad,${dependent.age}\n`;
    csvContent += `Condiciones Médicas,"${(dependent.medicalConditions || []).join(', ').replaceAll('"', '""')}"\n`;
    csvContent += `Fecha de Creación,${new Date(dependent.createdAt).toLocaleDateString('es-ES')}\n`;

    if (medications && medications.length > 0) {
      csvContent += '\n\nMEDICACIONES\n';
      csvContent += 'Medicamento,Dosis,Presentación,Fecha Inicio,Activa,Horarios\n';
      medications.forEach(med => {
        const horarios = med.schedules.map(s => `${s.time} (${s.dosage})`).join('; ');
        csvContent += `${med.name},${med.dose},${med.presentation},${new Date(med.startDate).toLocaleDateString('es-ES')},${med.isActive ? 'Sí' : 'No'},"${horarios}"\n`;
      });
    }

    if (appointments && appointments.length > 0) {
      csvContent += '\n\nCITAS MÉDICAS\n';
      csvContent += 'Fecha,Hora,Especialidad,Médico,Ubicación,Motivo,Estado\n';
      appointments.forEach(apt => {
        const fechaStr = new Date(apt.date).toLocaleDateString('es-ES');
        csvContent += `${fechaStr},${apt.time},${apt.specialty},"${(apt.doctor || '').replaceAll('"', '""')}",${apt.location},"${(apt.reason || '').replaceAll('"', '""')}",${apt.status}\n`;
      });
    }

    if (caregivers && caregivers.length > 0) {
      csvContent += '\n\nCUIDADORES\n';
      csvContent += 'Nombre,Email,Rol,Teléfono\n';
      caregivers.forEach(caregiver => {
        const phone = caregiver.phone || caregiver.phoneNumber || '';
        csvContent += `${caregiver.name},${caregiver.email},${this.getRoleLabel(caregiver.role)},${phone}\n`;
      });
    }

    if (uniqueTasks && uniqueTasks.length > 0) {
      csvContent += '\n\nTAREAS\n';
      csvContent += 'Título,Descripción,Prioridad\n';
      uniqueTasks.forEach(task => {
        csvContent += `${task.title},"${(task.description || '').replaceAll('"', '""')}",${task.priority}\n`;
      });
    }

    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${dependent.name}_datos_${this.getFormattedDate()}.csv`);
    link.click();
  }

  /**
   * Exportar a formato de texto simple
   */
  exportDependentToText(
    dependent: Dependent,
    medications?: Medication[],
    tasks?: Task[],
    appointments?: Appointment[],
    caregivers?: User[]
  ): void {
    const uniqueTasks = this.deduplicateTasks(tasks || []);

    let textContent = `DATOS DEL DEPENDIENTE - ${dependent.name}\n`;
    textContent += `${'='.repeat(50)}\n\n`;

    textContent += 'INFORMACIÓN PERSONAL\n';
    textContent += `${'-'.repeat(50)}\n`;
    textContent += `Nombre: ${dependent.name}\n`;
    textContent += `Edad: ${dependent.age} años\n`;
    if (dependent.medicalConditions && dependent.medicalConditions.length > 0) {
      textContent += `Condiciones Médicas: ${dependent.medicalConditions.join(', ')}\n`;
    }
    textContent += `Fecha de creación: ${new Date(dependent.createdAt).toLocaleDateString('es-ES')}\n`;

    if (medications && medications.length > 0) {
      textContent += '\n\nMEDICACIONES\n';
      textContent += `${'-'.repeat(50)}\n`;
      medications.forEach(med => {
        textContent += `\n• ${med.name}\n`;
        textContent += `  Dosis: ${med.dose}\n`;
        textContent += `  Presentación: ${med.presentation}\n`;
        textContent += `  Activa: ${med.isActive ? 'Sí' : 'No'}\n`;
        textContent += `  Inicio: ${new Date(med.startDate).toLocaleDateString('es-ES')}\n`;
        if (med.endDate) {
          textContent += `  Fin: ${new Date(med.endDate).toLocaleDateString('es-ES')}\n`;
        }
        textContent += '  Horarios:\n';
        med.schedules.forEach(schedule => {
          const notesPart = schedule.notes ? ` (${schedule.notes})` : '';
          textContent += `    - ${schedule.time}: ${schedule.dosage}${notesPart}\n`;
        });
      });
    }

    if (appointments && appointments.length > 0) {
      textContent += '\n\nCITAS MÉDICAS\n';
      textContent += `${'-'.repeat(50)}\n`;
      appointments.forEach(apt => {
        const fechaStr = new Date(apt.date).toLocaleDateString('es-ES');
        textContent += `\n• ${fechaStr} a las ${apt.time}\n`;
        textContent += `  Especialidad: ${apt.specialty}\n`;
        if (apt.doctor) {
          textContent += `  Médico: ${apt.doctor}\n`;
        }
        textContent += `  Ubicación: ${apt.location}\n`;
        if (apt.reason) {
          textContent += `  Motivo: ${apt.reason}\n`;
        }
        textContent += `  Estado: ${apt.status}\n`;
      });
    }

    if (caregivers && caregivers.length > 0) {
      textContent += '\n\nCUIDADORES\n';
      textContent += `${'-'.repeat(50)}\n`;
      caregivers.forEach(caregiver => {
        textContent += `\n• ${caregiver.name}\n`;
        textContent += `  Email: ${caregiver.email}\n`;
        textContent += `  Rol: ${this.getRoleLabel(caregiver.role)}\n`;
        const phone = caregiver.phone || caregiver.phoneNumber;
        if (phone) {
          textContent += `  Teléfono: ${phone}\n`;
        }
      });
    }

    if (uniqueTasks && uniqueTasks.length > 0) {
      textContent += '\n\nTAREAS\n';
      textContent += `${'-'.repeat(50)}\n`;
      uniqueTasks.forEach(task => {
        textContent += `\n• ${task.title}\n`;
        if (task.description) {
          textContent += `  Descripción: ${task.description}\n`;
        }
        textContent += `  Prioridad: ${task.priority}\n`;
      });
    }

    textContent += `\n\nFecha de exportación: ${new Date().toLocaleString('es-ES')}\n`;

    this.downloadFile(textContent, `${dependent.name}_datos_${this.getFormattedDate()}.txt`, 'text/plain');
  }

  /**
   * Desduplicar tareas por título
   */
  private deduplicateTasks(tasks: Task[]): Task[] {
    const seen = new Map<string, Task>();
    tasks.forEach(task => {
      if (!seen.has(task.title)) {
        seen.set(task.title, task);
      }
    });
    return Array.from(seen.values());
  }

  /**
   * Descargar archivo
   */
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const element = document.createElement('a');
    element.setAttribute('href', `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`);
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    element.remove();
  }

  /**
   * Obtener fecha formateada para nombres de archivo
   */
  private getFormattedDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
