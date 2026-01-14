import io
import logging
from datetime import datetime
from typing import Dict, Any, Optional

import plotly.graph_objects as go
import plotly.io as pio
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER


def create_chart_image(data: Dict[str, Any], chart_type: str) -> Optional[io.BytesIO]:
    try:
        fig = go.Figure()

        if chart_type == 'branch_loading':
            for branch, values in data.get('branches', {}).items():
                fig.add_trace(go.Scatter(
                    x=data.get('datetime', []),
                    y=values,
                    mode='lines',
                    name=branch,
                    line=dict(width=2)
                ))
            fig.update_layout(
                title='Branch Loading Over Time',
                xaxis_title='Time',
                yaxis_title='% of MVA Limit',
                height=500,
                margin=dict(l=60, r=40, t=60, b=150),
                showlegend=True,
                legend=dict(orientation='h', yanchor='top', y=-0.15, xanchor='center', x=0.5)
            )
            fig.add_hline(y=100, line_dash="dash", line_color="red", line_width=2)
            fig.add_hline(y=90, line_dash="dash", line_color="orange", line_width=2)

        elif chart_type == 'battery_capacity':
            for bus, capacity in data.items():
                fig.add_trace(go.Scatter(
                    x=list(range(len(capacity))),
                    y=capacity,
                    mode='lines',
                    name=f'Bus {bus}',
                    line=dict(width=2)
                ))
            fig.update_layout(
                title='Battery Capacity Over Time',
                xaxis_title='Timestep',
                yaxis_title='Capacity (kWh)',
                height=500,
                margin=dict(l=60, r=40, t=60, b=150),
                showlegend=True,
                legend=dict(orientation='h', yanchor='top', y=-0.15, xanchor='center', x=0.5)
            )

        elif chart_type == 'mw_from':
            for branch, values in data.get('branches', {}).items():
                fig.add_trace(go.Scatter(
                    x=data.get('datetime', []),
                    y=values,
                    mode='lines',
                    name=branch,
                    line=dict(width=2)
                ))
            fig.update_layout(
                title='Branch Power Flow (MW From)',
                xaxis_title='Time',
                yaxis_title='Power (MW)',
                height=500,
                margin=dict(l=60, r=40, t=60, b=150),
                showlegend=True,
                legend=dict(orientation='h', yanchor='top', y=-0.15, xanchor='center', x=0.5)
            )
            fig.add_hline(y=0, line_dash="dot", line_color="gray", line_width=2)

        elif chart_type == 'bus_voltage':
            for bus, values in data.get('buses', {}).items():
                fig.add_trace(go.Scatter(
                    x=data.get('datetime', []),
                    y=values,
                    mode='lines',
                    name=f'Bus {bus}',
                    line=dict(width=2)
                ))
            fig.update_layout(
                title='Bus Voltage Profile (Per Unit)',
                xaxis_title='Time',
                yaxis_title='Voltage (p.u.)',
                height=500,
                margin=dict(l=60, r=40, t=60, b=150),
                showlegend=True,
                legend=dict(orientation='h', yanchor='top', y=-0.15, xanchor='center', x=0.5)
            )
            fig.add_hline(y=0.9, line_dash="dash", line_color="red", line_width=2)
            fig.add_hline(y=1.1, line_dash="dash", line_color="red", line_width=2)

        img_bytes = pio.to_image(fig, format='png', width=800, height=500)
        return io.BytesIO(img_bytes)

    except Exception as e:
        logging.error(f"Error creating chart {chart_type}: {e}", exc_info=True)
        return None


def generate_pdf_report(request: Dict[str, Any]) -> io.BytesIO:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.5 * inch,
        leftMargin=0.5 * inch,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch
    )

    story = []
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1f2937'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=16,
        textColor=colors.HexColor('#374151'),
        spaceAfter=12,
        spaceBefore=12
    )

    story.append(Paragraph("PowerWorld Simulation Report", title_style))
    story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    story.append(Spacer(1, 20))

    _add_budget_section(story, request, heading_style, styles)
    _add_battery_config_section(story, request, heading_style)
    _add_validation_section(story, request, heading_style, styles)
    _add_statistics_section(story, request, heading_style)
    _add_battery_schedule_section(story, request, heading_style, styles)
    _add_charts_section(story, request, heading_style, styles)

    doc.build(story)
    buffer.seek(0)
    return buffer


def _add_budget_section(story, request, heading_style, styles):
    if 'budget_summary' not in request or not request['budget_summary']:
        return

    budget = request['budget_summary']
    story.append(Paragraph("Budget Summary", heading_style))

    budget_data = [
        ['Metric', 'Value'],
        ['Total Cost', f"€{budget['total_cost_eur']:,.0f}"],
        ['Budget Limit', f"€{budget['budget_limit_eur']:,.0f}"],
        ['Percentage Used', f"{budget['percentage_used']:.1f}%"],
        ['Status', 'Over Budget' if budget['is_over_budget'] else 'Within Budget']
    ]

    table = Table(budget_data, colWidths=[3 * inch, 3 * inch])
    table.setStyle(_get_table_style())
    story.append(table)
    story.append(Spacer(1, 20))


def _add_battery_config_section(story, request, heading_style):
    if 'battery_costs' not in request or not request['battery_costs']:
        return

    story.append(Paragraph("Battery Configuration", heading_style))

    battery_data = [['Bus', 'Type', 'Max Capacity (kWh)', 'Installed (kWh)', 'Cost (€/kWh)', 'Total Cost (€)']]

    for bus, cost_info in sorted(request['battery_costs'].items(), key=lambda x: int(x[0])):
        battery_data.append([
            f"Bus {bus}",
            cost_info['battery_type'],
            f"{cost_info['max_capacity_kwh']:.2f}",
            f"{cost_info['rounded_capacity_kwh']:.0f}",
            f"{cost_info['cost_per_kwh']:.0f}",
            f"€{cost_info['total_cost_eur']:,.0f}"
        ])

    table = Table(battery_data, colWidths=[0.8 * inch, 1.2 * inch, 1.3 * inch, 1.3 * inch, 1.1 * inch, 1.1 * inch])
    table.setStyle(_get_table_style(align='CENTER', font_size=9))
    story.append(table)
    story.append(Spacer(1, 20))


def _add_validation_section(story, request, heading_style, styles):
    errors = request.get('errors', [])
    warnings = request.get('warnings', [])
    reverse_flow_errors = request.get('reverse_flow_errors', [])
    voltage_errors = request.get('voltage_errors', [])

    if not any([errors, warnings, reverse_flow_errors, voltage_errors]):
        return

    story.append(Paragraph("Validation Issues", heading_style))

    if errors or reverse_flow_errors or voltage_errors:
        story.append(Paragraph("<b>Errors:</b>", styles['Normal']))
        for err in errors + reverse_flow_errors + voltage_errors:
            if 'message' in err:
                story.append(Paragraph(f"• {err['message']}", styles['Normal']))
        story.append(Spacer(1, 10))

    if warnings:
        story.append(Paragraph("<b>Warnings:</b>", styles['Normal']))
        for warn in warnings:
            if 'message' in warn:
                story.append(Paragraph(f"• {warn['message']}", styles['Normal']))
        story.append(Spacer(1, 10))


def _add_statistics_section(story, request, heading_style):
    if 'statistics' not in request or not request['statistics']:
        return

    story.append(PageBreak())
    story.append(Paragraph("Statistics", heading_style))

    stats = request['statistics']
    stats_data = [
        ['Metric', 'Value'],
        ['Maximum Loading', f"{stats.get('max', 0):.2f}%"],
        ['Minimum Loading', f"{stats.get('min', 0):.2f}%"],
        ['Average Loading', f"{stats.get('avg', 0):.2f}%"],
        ['Branches Over 100%', str(stats.get('overLimit', 0))],
        ['Main Line Below 90%', 'Yes' if stats.get('mainLineBelow90', False) else 'No'],
        ['Main Line Flatness', f"{stats.get('mainLineFlatness', 0):.2f}%" if stats.get('mainLineFlatness') is not None else 'N/A'],
        ['Main Line Load Factor', f"{stats.get('mainLineLoadFactor', 0):.3f}" if stats.get('mainLineLoadFactor') is not None else 'N/A'],
        ['Branches w/ Reverse Flow', str(stats.get('reverseFlowCount', 0))]
    ]

    if 'buses_with_violations_count' in request:
        stats_data.append(['Buses w/ Voltage Violations', str(request.get('buses_with_violations_count', 0))])

    table = Table(stats_data, colWidths=[3 * inch, 3 * inch])
    table.setStyle(_get_table_style())
    story.append(table)


def _add_battery_schedule_section(story, request, heading_style, styles):
    if 'battery_table' not in request or not request['battery_table']:
        return

    story.append(PageBreak())
    story.append(Paragraph("Battery Charging/Discharging Schedule", heading_style))
    story.append(Paragraph("Negative values indicate charging, positive values indicate discharging (MW)", styles['Normal']))
    story.append(Spacer(1, 10))

    battery_table_data = request['battery_table']
    columns = battery_table_data.get('columns', [])
    data = battery_table_data.get('data', [])
    metadata = battery_table_data.get('metadata', {})

    if not columns or not data:
        return

    header_row = []
    for col in columns:
        if col == 'Date':
            header_row.append('Date')
        elif col == 'Time':
            header_row.append('Time')
        elif col in metadata:
            header_row.append(f"Bus {metadata[col]}")
        else:
            header_row.append(col)

    table_data = [header_row]
    for row in data[:24]:
        table_row = []
        for col in columns:
            value = row.get(col, '')
            if col in ['Date', 'Time']:
                table_row.append(str(value))
            else:
                try:
                    table_row.append(f"{float(value):.2f}")
                except:
                    table_row.append(str(value))
        table_data.append(table_row)

    num_cols = len(columns)
    col_width = 6.5 * inch / num_cols if num_cols <= 5 else 0.8 * inch
    col_widths = [col_width] * num_cols

    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.beige, colors.lightgrey])
    ]))
    story.append(table)

    if len(data) > 24:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"<i>Note: Showing first 24 timesteps out of {len(data)} total</i>", styles['Normal']))

    story.append(Spacer(1, 20))


def _add_charts_section(story, request, heading_style, styles):
    story.append(PageBreak())
    story.append(Paragraph("Charts", heading_style))

    if 'lines_data' in request and request['lines_data']:
        story.append(Paragraph("Branch Loading Over Time", styles['Heading3']))
        chart_img = create_chart_image(request['lines_data'], 'branch_loading')
        if chart_img:
            img = Image(chart_img, width=6.5 * inch, height=4 * inch)
            story.append(img)
            story.append(Spacer(1, 20))

    if 'battery_capacity' in request and request['battery_capacity']:
        story.append(Paragraph("Battery Capacity Over Time", styles['Heading3']))
        chart_img = create_chart_image(request['battery_capacity'], 'battery_capacity')
        if chart_img:
            img = Image(chart_img, width=6.5 * inch, height=4 * inch)
            story.append(img)
            story.append(Spacer(1, 20))

    if 'mw_from_data' in request and request['mw_from_data'] and request['mw_from_data'].get('branches'):
        story.append(PageBreak())
        story.append(Paragraph("Branch Power Flow (MW From)", styles['Heading3']))
        chart_img = create_chart_image(request['mw_from_data'], 'mw_from')
        if chart_img:
            img = Image(chart_img, width=6.5 * inch, height=4 * inch)
            story.append(img)
            story.append(Spacer(1, 20))

    if 'buses_data' in request and request['buses_data'] and request['buses_data'].get('buses'):
        story.append(PageBreak())
        story.append(Paragraph("Bus Voltage Profile (Per Unit)", styles['Heading3']))
        story.append(Paragraph("Voltage limits: 0.9 - 1.1 p.u.", styles['Normal']))
        story.append(Spacer(1, 10))
        chart_img = create_chart_image(request['buses_data'], 'bus_voltage')
        if chart_img:
            img = Image(chart_img, width=6.5 * inch, height=4 * inch)
            story.append(img)
            story.append(Spacer(1, 20))


def _get_table_style(align='LEFT', font_size=12):
    return TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), align),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), font_size),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ])
