// @ts-nocheck
/**
 * SmartPay CRM — PDF Letter Generator Service
 * Generates crisp, professional A4 PDF letters using PDFKit.
 */

const PDFDocument = require('pdfkit');

function formatDate(dateStr) {
  if (!dateStr) return '_______________';
  try {
    const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

function formatSalary(amount) {
  if (!amount) return '_______________';
  const num = Number(amount);
  if (isNaN(num)) return String(amount);
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)} Lakhs per annum`;
  return `₹${num.toLocaleString('en-IN')} per annum`;
}

/**
 * Generate a PDF buffer for an HR letter
 * @param {string} type - 'offer' | 'appointment' | 'resignation' | 'termination' | 'experience'
 * @param {Object} data - Letter form fields
 * @returns {Promise<Buffer>}
 */
function generateLetterPDF(type, data = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `${data.employeeName || 'Employee'} - ${type.toUpperCase()} LETTER`,
          Author: data.companyName || 'SmartPay India Pvt. Ltd.',
          Subject: `${type.toUpperCase()} LETTER`,
          Keywords: 'SmartPay, HR, Letter, CRM'
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const companyName = data.companyName || 'SmartPay India Pvt. Ltd.';
      const companyAddress = data.companyAddress || '12th Floor, One World Centre, Bengaluru, Karnataka 560001';
      const employeeName = data.employeeName || 'Candidate';
      const position = data.position || 'Employee';
      const department = data.department || 'Sales & Operations';
      const signatoryName = data.signatoryName || 'Rashi Kumar';
      const signatoryTitle = data.signatoryTitle || 'HR Director';
      const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

      // ─── Header ──────────────────────────────────────────────────────────
      // Top accent banner
      doc.rect(50, 40, doc.page.width - 100, 4).fill('#2563EB');

      // Company Name
      doc.moveDown(0.5);
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#111827').text(companyName, 50, 56);
      
      // Company Address & Contact
      doc.fontSize(8.5).font('Helvetica').fillColor('#6B7280').text(companyAddress, 50, 78, { width: 350 });

      // Date on right
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text(`Date: ${today}`, doc.page.width - 200, 58, { width: 150, align: 'right' });
      doc.fontSize(8.5).font('Helvetica').fillColor('#6B7280').text('REF: SP-HR-' + Date.now().toString().slice(-6), doc.page.width - 200, 72, { width: 150, align: 'right' });

      // Divider line
      doc.strokeColor('#E5E7EB').lineWidth(1).moveTo(50, 100).lineTo(doc.page.width - 50, 100).stroke();

      // ─── Document Title Pill ─────────────────────────────────────────────
      const titles = {
        offer: 'EMPLOYMENT OFFER LETTER',
        appointment: 'LETTER OF APPOINTMENT',
        resignation: 'RESIGNATION ACCEPTANCE LETTER',
        termination: 'NOTICE OF EMPLOYMENT TERMINATION',
        experience: 'EXPERIENCE & RELIEVING CERTIFICATE'
      };
      const letterTitle = titles[type] || 'OFFICIAL HR LETTER';

      doc.rect(50, 114, doc.page.width - 100, 26).fill('#F3F4F6');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1F2937').text(letterTitle, 50, 122, { align: 'center', width: doc.page.width - 100 });

      // ─── Recipient Details ───────────────────────────────────────────────
      let curY = 154;
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#4B5563').text('To,', 50, curY);
      curY += 14;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#111827').text(employeeName, 50, curY);
      curY += 14;
      if (data.employeeId) {
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text(`Employee ID: ${data.employeeId}`, 50, curY);
        curY += 13;
      }
      if (data.recipientEmail) {
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text(`Email: ${data.recipientEmail}`, 50, curY);
        curY += 13;
      }
      if (data.workLocation) {
        doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text(`Location: ${data.workLocation}`, 50, curY);
        curY += 13;
      }

      curY += 6;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1F2937').text(`Subject: ${letterTitle} - ${position}`, 50, curY);
      curY += 18;

      doc.fontSize(10).font('Helvetica').fillColor('#111827').text(`Dear ${employeeName},`, 50, curY);
      curY += 18;

      // ─── Body Content by Type ─────────────────────────────────────────────
      doc.y = curY;
      doc.x = 50;

      const bodyWidth = doc.page.width - 100;
      const lineGap = 4;

      if (type === 'offer') {
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `We are delighted to extend this formal offer of employment for the position of ${position} in the ${department} department at ${companyName}. We were extremely impressed by your experience, skills, and potential during our discussions.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.7);

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111827').text('Key Terms of Employment:');
        doc.moveDown(0.4);

        // Grid summary box
        const boxTop = doc.y;
        doc.rect(50, boxTop, bodyWidth, 90).fillAndStroke('#F9FAFB', '#E5E7EB');
        
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
        doc.text('Position:', 62, boxTop + 10);
        doc.text('Department:', 62, boxTop + 24);
        doc.text('Date of Joining:', 62, boxTop + 38);
        doc.text('Annual CTC:', 62, boxTop + 52);
        doc.text('Reporting To:', 62, boxTop + 66);
        doc.text('Probation Period:', 62, boxTop + 80);

        doc.font('Helvetica').fillColor('#111827');
        doc.text(position, 170, boxTop + 10);
        doc.text(department, 170, boxTop + 24);
        doc.text(formatDate(data.joiningDate), 170, boxTop + 38);
        doc.text(formatSalary(data.salary), 170, boxTop + 52);
        doc.text(data.reportingTo || 'Reporting Manager', 170, boxTop + 66);
        doc.text(data.probationPeriod || '6 months', 170, boxTop + 80);

        doc.y = boxTop + 102;
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `This offer is contingent upon successful completion of background verification, reference checks, and submission of all mandatory onboarding documents. Upon successful completion of your probation period, your employment will be confirmed permanent in writing.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          `Please confirm your acceptance of this offer by signing and returning a digital copy of this letter within 7 business days from the date of issuance.`,
          { width: bodyWidth, lineGap }
        );

      } else if (type === 'appointment') {
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `With reference to your application and subsequent interviews, we are pleased to confirm your appointment as ${position} in the ${department} department at ${companyName}, effective ${formatDate(data.joiningDate)}.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.7);

        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#111827').text('Terms and Conditions of Appointment:');
        doc.moveDown(0.4);

        const boxTop = doc.y;
        doc.rect(50, boxTop, bodyWidth, 90).fillAndStroke('#F9FAFB', '#E5E7EB');

        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151');
        doc.text('Designation:', 62, boxTop + 10);
        doc.text('Date of Joining:', 62, boxTop + 24);
        doc.text('Annual CTC:', 62, boxTop + 38);
        doc.text('Reporting Manager:', 62, boxTop + 52);
        doc.text('Work Location:', 62, boxTop + 66);
        doc.text('Notice Period:', 62, boxTop + 80);

        doc.font('Helvetica').fillColor('#111827');
        doc.text(position, 170, boxTop + 10);
        doc.text(formatDate(data.joiningDate), 170, boxTop + 24);
        doc.text(formatSalary(data.salary), 170, boxTop + 38);
        doc.text(data.reportingTo || 'Reporting Manager', 170, boxTop + 52);
        doc.text(data.workLocation || 'Bengaluru, Karnataka', 170, boxTop + 66);
        doc.text(data.noticePeriod || '30 days', 170, boxTop + 80);

        doc.y = boxTop + 102;
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `You will be governed by the standard policies, code of business conduct, and rules of the company in force from time to time. A copy of the Employee Handbook will be issued to you on your first day.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          `We welcome you to the ${companyName} team and look forward to your valuable contributions towards our shared goals.`,
          { width: bodyWidth, lineGap }
        );

      } else if (type === 'resignation') {
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `This letter formally acknowledges receipt of your resignation notice dated ${formatDate(data.resignationDate)} from your role as ${position} in the ${department} department at ${companyName}.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          `We hereby accept your resignation. In accordance with your notice period and mutual agreement, your last working day with the company will be ${formatDate(data.lastWorkingDay)}.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        if (data.reason) {
          doc.text(`We note your stated reason for departure (${data.reason}) and respect your decision to pursue other opportunities.`, { width: bodyWidth, lineGap });
          doc.moveDown(0.6);
        }
        doc.text(
          `During the remaining notice period, please ensure complete knowledge transfer, proper documentation of pending projects, and the handover of all company assets. Your full and final settlement (F&F) will be processed within 45 working days following completion of all exit formalities.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(`We thank you for your contributions during your tenure and wish you the very best in your future endeavors.`, { width: bodyWidth, lineGap });

      } else if (type === 'termination') {
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `This letter serves as formal notification that your employment with ${companyName} as ${position} in the ${department} department is hereby terminated effective ${formatDate(data.terminationDate)}.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(`Reason for termination: ${data.reason || 'As communicated and documented during the performance/administrative review.'}`, { width: bodyWidth, lineGap });
        doc.moveDown(0.6);
        doc.text(
          `Your last working day will be ${formatDate(data.lastWorkingDay || data.terminationDate)}. You are instructed to return all company-owned property, including your ID badge, laptop, credentials, and documentation by this date.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          data.settlementNote || `Your full and final settlement, including any accrued salary and statutory payouts, will be processed within 45 working days following complete clearance from all departments.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          `Please be reminded that you remain bound by the confidentiality, non-disclosure, and non-solicitation covenants outlined in your employment agreement.`,
          { width: bodyWidth, lineGap }
        );

      } else if (type === 'experience') {
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `TO WHOMSOEVER IT MAY CONCERN`,
          { align: 'center', width: bodyWidth }
        );
        doc.moveDown(0.6);
        doc.fontSize(9.5).font('Helvetica').fillColor('#1F2937').text(
          `This is to certify that ${employeeName} was employed with ${companyName} as ${position} in the ${department} department from ${formatDate(data.joiningDate)} to ${formatDate(data.relievingDate || data.lastWorkingDay)}.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        doc.text(
          `During their tenure with us, ${employeeName} demonstrated high professional integrity, dedication, and diligence in discharging all assigned duties and responsibilities.`,
          { width: bodyWidth, lineGap }
        );
        doc.moveDown(0.6);
        if (data.conductNote) {
          doc.text(data.conductNote, { width: bodyWidth, lineGap });
          doc.moveDown(0.6);
        } else {
          doc.text(`Their conduct and character during employment were found to be satisfactory and commendable.`, { width: bodyWidth, lineGap });
          doc.moveDown(0.6);
        }
        doc.text(
          `They have been relieved of all official duties at the close of business hours on ${formatDate(data.relievingDate || data.lastWorkingDay)}. We wish them success in all their future personal and professional endeavors.`,
          { width: bodyWidth, lineGap }
        );
      }

      // ─── Signatory Block ──────────────────────────────────────────────────
      doc.moveDown(1.5);
      if (doc.y > doc.page.height - 150) {
        doc.addPage();
      }

      const sigY = Math.max(doc.y, doc.page.height - 180);
      doc.fontSize(9.5).font('Helvetica').fillColor('#374151').text('Yours sincerely,', 50, sigY);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(`For ${companyName}`, 50, sigY + 14);

      // Signature line placeholder
      doc.strokeColor('#9CA3AF').lineWidth(0.8).dash(3, { space: 2 }).moveTo(50, sigY + 60).lineTo(220, sigY + 60).undash().stroke();

      doc.fontSize(10).font('Helvetica-Bold').fillColor('#111827').text(signatoryName, 50, sigY + 66);
      doc.fontSize(8.5).font('Helvetica').fillColor('#6B7280').text(`${signatoryTitle}`, 50, sigY + 79);
      doc.text(companyName, 50, sigY + 91);

      // ─── Footer Watermark ────────────────────────────────────────────────
      doc.rect(50, doc.page.height - 45, doc.page.width - 100, 1).fill('#E5E7EB');
      doc.fontSize(7.5).font('Helvetica').fillColor('#9CA3AF').text(
        `This is a digitally generated document issued by SmartPay CRM. Page 1 of 1 • Strictly Private & Confidential`,
        50,
        doc.page.height - 35,
        { align: 'center', width: doc.page.width - 100 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateLetterPDF,
  formatDate,
  formatSalary
};
