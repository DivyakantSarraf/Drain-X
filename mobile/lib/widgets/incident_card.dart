import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/incident.dart';
import 'severity_badge.dart';
import 'status_badge.dart';

class IncidentCard extends StatelessWidget {
  final Incident incident;
  final VoidCallback onTap;

  const IncidentCard({
    Key? key,
    required this.incident,
    required this.onTap,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final dateFormat = DateFormat('MMM dd, HH:mm');
    final formattedDate = dateFormat.format(incident.createdAt.toLocal());

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header row: ID + Status + Severity
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Text(
                        incident.id,
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          color: Color(0xFF0284C7),
                        ),
                      ),
                      if (incident.source == 'CITIZEN') ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                          decoration: BoxDecoration(
                            color: const Color(0xFFDCFCE7),
                            borderRadius: BorderRadius.circular(3),
                            border: Border.all(color: const Color(0xFF86EFAC)),
                          ),
                          child: const Text(
                            'CITIZEN',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF166534),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Row(
                    children: [
                      SeverityBadge(severity: incident.severity, isCompact: true),
                      const SizedBox(width: 4),
                      StatusBadge(status: incident.status, isCompact: true),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Category Title
              Text(
                IncidentConstants.formatCategory(incident.category),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF0F172A),
                ),
              ),
              const SizedBox(height: 4),

              // Description snippet
              Text(
                incident.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF475569),
                  height: 1.3,
                ),
              ),
              const SizedBox(height: 10),

              // Footer row: Coordinates, Photos count, Timestamp
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_on_outlined, size: 14, color: Color(0xFF64748B)),
                      const SizedBox(width: 3),
                      Text(
                        '${incident.latitude.toStringAsFixed(3)}°N, ${incident.longitude.toStringAsFixed(3)}°E',
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: Color(0xFF64748B),
                        ),
                      ),
                      if (incident.photos.isNotEmpty) ...[
                        const SizedBox(width: 10),
                        const Icon(Icons.photo_camera_outlined, size: 14, color: Color(0xFF0284C7)),
                        const SizedBox(width: 3),
                        Text(
                          '${incident.photos.length}',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF0284C7),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(
                    formattedDate,
                    style: const TextStyle(
                      fontSize: 11,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
