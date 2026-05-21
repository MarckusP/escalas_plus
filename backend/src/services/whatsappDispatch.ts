import * as wa from './whatsappMessageService';

/** Disparos WhatsApp alinhados aos tipos de notificação do app. */
export async function dispatchWhatsAppNotification(opts: {
  type: string;
  title: string;
  body: string;
  linkPath: string;
  recipientIds?: number[];
  referenceType?: string;
  referenceId?: number;
  generalBroadcast?: boolean;
}) {
  try {
    if (opts.generalBroadcast) {
      await wa.queueGeneral(opts.title, opts.body, opts.linkPath, opts.referenceType, opts.referenceId);
      return;
    }
    const ids = opts.recipientIds || [];
    for (const rid of ids) {
      await wa.queueIndividual(
        rid,
        opts.title,
        opts.body,
        opts.linkPath,
        opts.referenceType,
        opts.referenceId
      );
    }
  } catch (e) {
    console.error('WhatsApp dispatch:', e);
  }
}
