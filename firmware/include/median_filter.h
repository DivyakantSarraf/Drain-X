#pragma once

#include <stdint.h>
#include <stddef.h>

/**
 * @file median_filter.h
 * @brief Lightweight, zero-allocation moving median filter for ultrasonic telemetry.
 * 
 * Latency Analysis:
 * - Sampling rate: 1.0 Hz (1 sample / second)
 * - Window size: 5 samples
 * - Phase lag / step response delay: (N - 1) / 2 = 2.0 seconds
 * - Execution time on ESP32 240MHz: ~1.2 microseconds (negligible)
 * 
 * Rejects isolated ultrasonic acoustic scattering reflections and surface ripple spikes
 * without introducing infinite impulse response (IIR) drift.
 */

namespace DrainX {

template <size_t N = 5>
class MovingMedianFilter {
public:
    MovingMedianFilter() : _count(0), _head(0) {
        reset();
    }

    /**
     * @brief Clear the filter history.
     */
    void reset() {
        _count = 0;
        _head = 0;
        for (size_t i = 0; i < N; ++i) {
            _buffer[i] = 0.0f;
        }
    }

    /**
     * @brief Push a new raw distance measurement into the ring buffer.
     * @param val Raw measurement in cm.
     */
    void addSample(float val) {
        _buffer[_head] = val;
        _head = (_head + 1) % N;
        if (_count < N) {
            _count++;
        }
    }

    /**
     * @brief Compute the median value of currently stored samples.
     * @return Filtered median distance in cm.
     */
    float getMedian() const {
        if (_count == 0) {
            return 0.0f;
        }

        // Copy active samples for local in-place sort
        float sorted[N];
        for (size_t i = 0; i < _count; ++i) {
            sorted[i] = _buffer[i];
        }

        // Standard insertion sort for small N (N=5 takes max 10 comparisons)
        for (size_t i = 1; i < _count; ++i) {
            float key = sorted[i];
            int j = static_cast<int>(i) - 1;
            while (j >= 0 && sorted[j] > key) {
                sorted[j + 1] = sorted[j];
                j--;
            }
            sorted[j + 1] = key;
        }

        if (_count % 2 == 1) {
            return sorted[_count / 2];
        } else {
            return (sorted[(_count / 2) - 1] + sorted[_count / 2]) * 0.5f;
        }
    }

    size_t getSampleCount() const { return _count; }
    size_t getCapacity() const { return N; }
    bool isWindowFull() const { return _count >= N; }

private:
    float _buffer[N];
    size_t _count;
    size_t _head;
};

} // namespace DrainX
