import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../core/network/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/validators.dart';
import '../../models/incident.dart';
import '../../widgets/severity_badge.dart';

class CitizenReportScreen extends StatefulWidget {
  final String reporterName;

  const CitizenReportScreen({
    Key? key,
    required this.reporterName,
  }) : super(key: key);

  @override
  State<CitizenReportScreen> createState() => _CitizenReportScreenState();
}

class _CitizenReportScreenState extends State<CitizenReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final ApiClient _apiClient = ApiClient();

  String _selectedCategory = 'DRAIN_BLOCKAGE';
  String _selectedSeverity = 'HIGH';
  final TextEditingController _descController = TextEditingController();
  final TextEditingController _latController = TextEditingController(text: '15.4925');
  final TextEditingController _lngController = TextEditingController(text: '73.8240');

  final List<PhotoUploadItem> _attachedPhotos = [];
  bool _isSubmitting = false;
  String? _submissionStatusMessage;

  final List<Map<String, dynamic>> _quickLocations = [
    {'name': 'St. Inez Creek Culvert', 'lat': 15.4925, 'lng': 73.8240},
    {'name': 'Patto Plaza Junction', 'lat': 15.4989, 'lng': 73.8342},
    {'name': 'Fontainhas Drain', 'lat': 15.4965, 'lng': 73.8305},
    {'name': 'Miramar Outfall Sluice', 'lat': 15.4835, 'lng': 73.8078},
  ];

  void _addMockEvidencePhoto(String label) {
    if (_attachedPhotos.length >= 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Maximum 3 photographs per incident allowed.')),
      );
      return;
    }

    // Valid binary JPEG header (JFIF) + payload for competition testing
    final jpegHeader = [
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43
    ];
    final dummyBytes = Uint8List.fromList([...jpegHeader, ...List.filled(200, 0x41)]);

    final photoNum = _attachedPhotos.length + 1;
    setState(() {
      _attachedPhotos.add(
        PhotoUploadItem(
          filename: 'photo_evidence_$photoNum.jpg',
          bytes: dummyBytes,
          mimeType: 'image/jpeg',
        ),
      );
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Attached "$label" ($photoNum/3)')),
    );
  }

  void _removePhoto(int index) {
    setState(() {
      _attachedPhotos.removeAt(index);
    });
  }

  Future<void> _submitReport() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isSubmitting = true;
      _submissionStatusMessage = 'Registering report with DRAIN-X backend...';
    });

    try {
      final lat = double.parse(_latController.text.trim());
      final lng = double.parse(_lngController.text.trim());

      // Step 1: Create incident record
      final createdIncident = await _apiClient.createIncident(
        category: _selectedCategory,
        description: _descController.text.trim(),
        latitude: lat,
        longitude: lng,
        severity: _selectedSeverity,
        source: 'CITIZEN',
        reporterName: widget.reporterName,
      );

      // Step 2: If photos attached, upload multipart evidence
      if (_attachedPhotos.isNotEmpty) {
        setState(() {
          _submissionStatusMessage = 'Uploading ${_attachedPhotos.length} photo evidence file(s)...';
        });

        await _apiClient.uploadIncidentPhotos(createdIncident.id, _attachedPhotos);
      }

      setState(() {
        _isSubmitting = false;
      });

      // Show Success Dialog
      if (!mounted) return;
      await showDialog(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          icon: const Icon(Icons.check_circle, size: 48, color: Color(0xFF16A34A)),
          title: const Text('Incident Reported Successfully', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Your report has been logged in the DRAIN-X flood intelligence platform and broadcasted to Municipal Operations.',
                style: TextStyle(fontSize: 12, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Tracking ID: ${createdIncident.id}', style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, fontSize: 13, color: Color(0xFF0284C7))),
                    const SizedBox(height: 4),
                    Text('Category: ${_selectedCategory.replaceAll('_', ' ')}', style: const TextStyle(fontSize: 11)),
                    Text('Coordinates: $lat°N, $lng°E', style: const TextStyle(fontSize: 11)),
                    if (_attachedPhotos.isNotEmpty)
                      Text('Photos: ${_attachedPhotos.length} evidence file(s) uploaded', style: const TextStyle(fontSize: 11, color: Color(0xFF16A34A), fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            ElevatedButton(
              onPressed: () {
                Navigator.pop(ctx);
                Navigator.pop(context, true); // return to dashboard with refresh flag
              },
              child: const Text('View on Dashboard'),
            ),
          ],
        ),
      );
    } catch (e) {
      setState(() {
        _isSubmitting = false;
      });
      if (!mounted) return;
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Submission Failed', style: TextStyle(color: Color(0xFFDC2626))),
          content: Text(e.toString(), style: const TextStyle(fontSize: 12)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Report Drainage Hazard'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Category Dropdown
              const Text(
                'HAZARD CATEGORY *',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _selectedCategory,
                decoration: const InputDecoration(),
                items: IncidentConstants.categories.map((cat) {
                  return DropdownMenuItem(
                    value: cat,
                    child: Text(IncidentConstants.formatCategory(cat), style: const TextStyle(fontSize: 13)),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) setState(() => _selectedCategory = val);
                },
              ),

              const SizedBox(height: 18),

              // Severity Selector
              const Text(
                'PERCEIVED SEVERITY *',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 6),
              Row(
                children: IncidentConstants.severities.map((sev) {
                  final isSelected = _selectedSeverity == sev;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: InkWell(
                        onTap: () => setState(() => _selectedSeverity = sev),
                        borderRadius: BorderRadius.circular(8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: isSelected ? AppTheme.primaryNavy : Colors.white,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: isSelected ? AppTheme.accentCyan : const Color(0xFFCBD5E1),
                              width: isSelected ? 1.5 : 1,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: SeverityBadge(severity: sev, isCompact: true),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 18),

              // Description
              const Text(
                'OBSERVATIONS & DESCRIPTION *',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 6),
              TextFormField(
                controller: _descController,
                maxLines: 3,
                validator: Validators.validateDescription,
                decoration: const InputDecoration(
                  hintText: 'Describe the blockage, water depth, debris, or overflow issue...',
                ),
              ),

              const SizedBox(height: 20),

              // Geographic Coordinates Section
              const Text(
                'INCIDENT LOCATION (COORDINATES) *',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
              ),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _latController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: Validators.validateLatitude,
                      decoration: const InputDecoration(labelText: 'Latitude (°N)'),
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _lngController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      validator: Validators.validateLongitude,
                      decoration: const InputDecoration(labelText: 'Longitude (°E)'),
                      style: const TextStyle(fontFamily: 'monospace', fontSize: 13),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // Quick Location Presets
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _quickLocations.map((loc) {
                  return ActionChip(
                    avatar: const Icon(Icons.place, size: 14, color: AppTheme.accentTeal),
                    label: Text(loc['name'] as String, style: const TextStyle(fontSize: 11)),
                    backgroundColor: Colors.white,
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    onPressed: () {
                      setState(() {
                        _latController.text = (loc['lat'] as double).toStringAsFixed(4);
                        _lngController.text = (loc['lng'] as double).toStringAsFixed(4);
                      });
                    },
                  );
                }).toList(),
              ),

              const SizedBox(height: 22),

              // Photographic Evidence Section
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'PHOTOGRAPHIC EVIDENCE (OPTIONAL)',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Color(0xFF475569)),
                  ),
                  Text(
                    '${_attachedPhotos.length}/3 photos',
                    style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                  ),
                ],
              ),
              const SizedBox(height: 8),

              // Photo Action Buttons
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.camera_alt_outlined, size: 18),
                      label: const Text('Capture Camera Photo', style: TextStyle(fontSize: 11)),
                      onPressed: () => _addMockEvidencePhoto('Drain Blockage Camera Capture'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.photo_library_outlined, size: 18),
                      label: const Text('Select from Gallery', style: TextStyle(fontSize: 11)),
                      onPressed: () => _addMockEvidencePhoto('Waterlogging Field Evidence'),
                    ),
                  ),
                ],
              ),

              // Photo Previews
              if (_attachedPhotos.isNotEmpty) ...[
                const SizedBox(height: 10),
                SizedBox(
                  height: 90,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: _attachedPhotos.length,
                    itemBuilder: (ctx, idx) {
                      final photo = _attachedPhotos[idx];
                      return Container(
                        width: 120,
                        margin: const EdgeInsets.only(right: 10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF0F172A),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: const Color(0xFF06B6D4)),
                        ),
                        child: Stack(
                          children: [
                            Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.image, color: Color(0xFF38BDF8), size: 28),
                                  const SizedBox(height: 4),
                                  Text(
                                    photo.filename,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white70, fontSize: 10),
                                  ),
                                ],
                              ),
                            ),
                            Positioned(
                              top: 4,
                              right: 4,
                              child: GestureDetector(
                                onTap: () => _removePhoto(idx),
                                child: Container(
                                  padding: const EdgeInsets.all(2),
                                  decoration: const BoxDecoration(
                                    color: Colors.red,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const Icon(Icons.close, size: 12, color: Colors.white),
                                ),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],

              const SizedBox(height: 32),

              // Submit Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submitReport,
                  child: _isSubmitting
                      ? Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            ),
                            const SizedBox(width: 12),
                            Text(_submissionStatusMessage ?? 'Submitting...'),
                          ],
                        )
                      : const Text('SUBMIT INCIDENT REPORT'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
